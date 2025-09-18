/* eslint-disable no-undef */
(function () {
  'use strict';

  const urlParams = new URLSearchParams(window.location.search);

  const defaultConfig = window.APP_CONFIG || {};
  const config = {
    dataUrl: urlParams.get('data') || defaultConfig.dataUrl,
    columns: {
      gender: urlParams.get('colGender') || defaultConfig.columns.gender,
      nationality: urlParams.get('colNationality') || defaultConfig.columns.nationality,
      visa: urlParams.get('colVisa') || defaultConfig.columns.visa,
      school: urlParams.get('colSchool') || defaultConfig.columns.school
    },
    charts: {
      nationalityTopN: Number(urlParams.get('topN')) || defaultConfig.charts.nationalityTopN,
      stackedVisaTopNationalityN: Number(urlParams.get('stackedTopN')) || defaultConfig.charts.stackedVisaTopNationalityN
    },
    table: defaultConfig.table
  };

  // ---------- Utilities ----------
  function normalizeValue(value) {
    if (value === null || value === undefined) return '';
    const s = String(value).trim();
    if (s === '-' || s === 'null' || s.toLowerCase() === 'na') return '';
    return s;
  }

  function detectColumns(rows) {
    const header = rows[0];
    const candidates = {
      gender: [/^성별$/i, /^gender$/i, /^sex$/i],
      nationality: [/^국적명$/i, /^국적$/i, /^nationality$/i, /^country$/i],
      visa: [/^체류자격$/i, /^visa$/i, /^status$/i],
      school: [/^학교명$/i, /^학교$/i, /^university$/i, /^school$/i]
    };

    const result = { ...config.columns };
    for (const [key, patterns] of Object.entries(candidates)) {
      if (header.includes(result[key])) continue;
      const found = header.find((h) => patterns.some((p) => p.test(h)));
      if (found) result[key] = found;
    }
    return result;
  }

  function groupCount(items, keyFn) {
    const map = new Map();
    for (const it of items) {
      const key = keyFn(it) || '(không rõ)';
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map, ([key, value]) => ({ key, value }))
      .sort((a, b) => b.value - a.value);
  }

  function makePalette(n) {
    const base = [
      '#5cc8ff','#7c8cff','#6ee7b7','#fbbf24','#f472b6','#60a5fa','#f87171','#34d399','#a78bfa','#f59e0b',
      '#22d3ee','#fb7185','#84cc16','#eab308','#14b8a6','#ef4444','#8b5cf6','#38bdf8','#d946ef','#10b981'
    ];
    const colors = [];
    for (let i = 0; i < n; i++) colors.push(base[i % base.length]);
    return colors;
  }

  function downloadCsv(filename, rows) {
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------- State ----------
  let rawRows = [];
  let mappedColumns = { ...config.columns };
  let filteredRows = [];
  let tablePage = 1;

  // ---------- Elements ----------
  const elDataSource = document.getElementById('dataSource');
  const elFilterGender = document.getElementById('filterGender');
  const elFilterVisa = document.getElementById('filterVisa');
  const elSearchSchool = document.getElementById('searchSchool');
  const elReloadBtn = document.getElementById('reloadBtn');
  const elDownloadFiltered = document.getElementById('downloadFiltered');
  const elTableBody = document.querySelector('#dataTable tbody');

  // ---------- Charts ----------
  let chartNationality;
  let chartGender;
  let chartStacked;

  function destroyCharts() {
    for (const c of [chartNationality, chartGender, chartStacked]) {
      if (c && typeof c.destroy === 'function') c.destroy();
    }
  }

  function renderCharts() {
    destroyCharts();
    const cols = mappedColumns;

    const nationalityCounts = groupCount(filteredRows, (r) => normalizeValue(r[cols.nationality]));
    const topN = nationalityCounts.slice(0, config.charts.nationalityTopN);
    chartNationality = new Chart(
      document.getElementById('chartByNationality'),
      {
        type: 'bar',
        data: {
          labels: topN.map((d) => d.key),
          datasets: [{
            label: 'Số lượng',
            data: topN.map((d) => d.value),
            backgroundColor: makePalette(topN.length)
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { x: { ticks: { color: '#c7d2fe' } }, y: { ticks: { color: '#c7d2fe' } } }
        }
      }
    );

    const genderCounts = groupCount(filteredRows, (r) => normalizeValue(r[cols.gender]));
    chartGender = new Chart(
      document.getElementById('chartByGender'),
      {
        type: 'pie',
        data: {
          labels: genderCounts.map((d) => d.key),
          datasets: [{
            data: genderCounts.map((d) => d.value),
            backgroundColor: makePalette(genderCounts.length)
          }]
        },
        options: { responsive: true }
      }
    );

    const topNatForStack = nationalityCounts.slice(0, config.charts.stackedVisaTopNationalityN).map((d) => d.key);
    const rowsTop = filteredRows.filter((r) => topNatForStack.includes(normalizeValue(r[cols.nationality])));
    const visaSet = Array.from(new Set(rowsTop.map((r) => normalizeValue(r[cols.visa]))));
    const datasets = visaSet.map((visa, idx) => {
      const data = topNatForStack.map((nat) => rowsTop.filter((r) => normalizeValue(r[cols.visa]) === visa && normalizeValue(r[cols.nationality]) === nat).length);
      return { label: visa || '(không rõ)', data, backgroundColor: makePalette(visaSet.length)[idx] };
    });
    chartStacked = new Chart(
      document.getElementById('chartStackedVisa'),
      {
        type: 'bar',
        data: { labels: topNatForStack, datasets },
        options: {
          responsive: true,
          plugins: { legend: { position: 'bottom' } },
          scales: { x: { stacked: true, ticks: { color: '#c7d2fe' } }, y: { stacked: true, ticks: { color: '#c7d2fe' } } }
        }
      }
    );
  }

  // ---------- Table ----------
  function renderTable() {
    const cols = mappedColumns;
    const start = (tablePage - 1) * config.table.pageSize;
    const pageRows = filteredRows.slice(start, start + config.table.pageSize);
    elTableBody.innerHTML = '';
    for (const r of pageRows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${normalizeValue(r[cols.gender])}</td>
        <td>${normalizeValue(r[cols.nationality])}</td>
        <td>${normalizeValue(r[cols.visa])}</td>
        <td>${normalizeValue(r[cols.school])}</td>
      `;
      elTableBody.appendChild(tr);
    }
  }

  // ---------- Filters ----------
  function applyFilters() {
    const cols = mappedColumns;
    const g = elFilterGender.value;
    const v = elFilterVisa.value;
    const s = elSearchSchool.value.trim().toLowerCase();
    filteredRows = rawRows.filter((r) => {
      if (g && normalizeValue(r[cols.gender]) !== g) return false;
      if (v && normalizeValue(r[cols.visa]) !== v) return false;
      if (s && !normalizeValue(r[cols.school]).toLowerCase().includes(s)) return false;
      return true;
    });
    tablePage = 1;
    renderCharts();
    renderTable();
  }

  function populateFilterOptions() {
    const cols = mappedColumns;
    const genders = Array.from(new Set(rawRows.map((r) => normalizeValue(r[cols.gender])).filter(Boolean))).sort();
    const visas = Array.from(new Set(rawRows.map((r) => normalizeValue(r[cols.visa])).filter(Boolean))).sort();

    elFilterGender.innerHTML = '<option value="">Tất cả</option>' + genders.map((g) => `<option>${g}</option>`).join('');
    elFilterVisa.innerHTML = '<option value="">Tất cả</option>' + visas.map((v) => `<option>${v}</option>`).join('');
  }

  // ---------- Data Loading ----------
  function loadCsv(url) {
    return new Promise((resolve, reject) => {
      Papa.parse(url, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (res) => resolve(res.data),
        error: (err) => reject(err)
      });
    });
  }

  async function init() {
    try {
      if (urlParams.get('data')) {
        // Add dynamic option when overridden via URL
        const opt = document.createElement('option');
        opt.value = config.dataUrl;
        opt.textContent = config.dataUrl + ' (URL)';
        elDataSource.appendChild(opt);
        elDataSource.value = config.dataUrl;
      }

      rawRows = await loadCsv(config.dataUrl);
      if (!Array.isArray(rawRows)) rawRows = [];
      const header = rawRows.length ? Object.keys(rawRows[0]) : [];
      mappedColumns = detectColumns([header]);

      filteredRows = rawRows.slice();
      populateFilterOptions();
      renderCharts();
      renderTable();
    } catch (e) {
      console.error(e);
      alert('Không thể tải dữ liệu. Kiểm tra đường dẫn hoặc CORS nếu dùng URL ngoài.');
    }
  }

  // ---------- Events ----------
  elReloadBtn.addEventListener('click', () => {
    config.dataUrl = elDataSource.value;
    init();
  });
  elFilterGender.addEventListener('change', applyFilters);
  elFilterVisa.addEventListener('change', applyFilters);
  elSearchSchool.addEventListener('input', applyFilters);
  elDownloadFiltered.addEventListener('click', () => {
    if (!filteredRows.length) return;
    downloadCsv('filtered.csv', filteredRows);
  });

  // ---------- Boot ----------
  init();
})();



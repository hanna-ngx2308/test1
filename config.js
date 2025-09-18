// High-level configuration to map dataset columns and tweak charts/UI.
// You can override any value via URL query, e.g.:
//   ?data=data/your.csv&colGender=성별&colNationality=국적명&colVisa=체류자격&colSchool=학교명&topN=10
// Any missing columns will be auto-detected by best-effort heuristics.

window.APP_CONFIG = {
  dataUrl: 'data/sample.csv',
  // Column names in the CSV (can be Korean headers). Case-sensitive.
  columns: {
    gender: '성별',
    nationality: '국적명',
    visa: '체류자격',
    school: '학교명'
  },
  charts: {
    nationalityTopN: 10,
    stackedVisaTopNationalityN: 8
  },
  table: {
    pageSize: 20
  }
};



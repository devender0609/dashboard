/* csv.js — CSV parse/serialize plus Excel export via SheetJS when available.
   Import validation errors are surfaced (never silently dropped) and feed the
   Data Quality page. */
(function () {
  const C = {};

  C.parse = function (text) {
    const rows = [];
    let row = [], field = "", inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
        } else field += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else field += ch;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    if (!rows.length) return { header: [], records: [] };
    const header = rows[0].map(h => h.trim());
    const records = rows.slice(1).map(r => {
      const o = {};
      header.forEach((h, idx) => { o[h] = (r[idx] ?? "").trim(); });
      return o;
    });
    return { header, records };
  };

  C.serialize = function (records, columns) {
    if (!records.length) return "";
    const cols = columns || Object.keys(records[0]);
    const esc = v => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [cols.join(",")].concat(records.map(r => cols.map(c => esc(r[c])).join(","))).join("\r\n");
  };

  C.downloadCSV = function (records, filename, columns) {
    const blob = new Blob(["﻿" + C.serialize(records, columns)], { type: "text/csv;charset=utf-8" });
    triggerDownload(blob, filename);
  };

  C.downloadExcel = function (sheets, filename) {
    if (typeof XLSX === "undefined") {
      alert("Excel export requires the bundled SheetJS library (offline right now). CSV export is still available.");
      return;
    }
    const wb = XLSX.utils.book_new();
    Object.entries(sheets).forEach(([name, records]) => {
      const ws = XLSX.utils.json_to_sheet(records);
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    });
    XLSX.writeFile(wb, filename);
  };

  C.readFile = function (file, cb) {
    const reader = new FileReader();
    const isExcel = /\.xlsx?$/i.test(file.name);
    if (isExcel && typeof XLSX !== "undefined") {
      reader.onload = e => {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
        const first = wb.SheetNames[0];
        const records = XLSX.utils.sheet_to_json(wb.Sheets[first], { raw: false, defval: "" });
        cb({ header: records.length ? Object.keys(records[0]) : [], records });
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = e => cb(C.parse(e.target.result));
      reader.readAsText(file);
    }
  };

  function triggerDownload(blob, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }

  window.SQICsv = C;
  if (typeof module !== "undefined") module.exports = C;
})();

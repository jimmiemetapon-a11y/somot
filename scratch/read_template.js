import XLSX from 'xlsx';
import { readFileSync } from 'fs';

const buf = readFileSync('public/templates/PNL_Statement_Template.xlsx');
const wb = XLSX.read(buf, { type: 'buffer' });
const ws = wb.Sheets[wb.SheetNames[0]];
const range = XLSX.utils.decode_range(ws['!ref']);
console.log('Sheet:', wb.SheetNames[0]);
console.log('Range:', ws['!ref']);
for (let R = range.s.r; R <= Math.min(range.e.r, 45); R++) {
  let row = [];
  for (let C = range.s.c; C <= Math.min(range.e.c, 12); C++) {
    const addr = XLSX.utils.encode_cell({ r: R, c: C });
    const cell = ws[addr];
    row.push(cell ? String(cell.v || '').substring(0, 30) : '___');
  }
  console.log('R' + R + ': ' + row.join(' | '));
}

// Helper for Shimmer-Snap animation
export function animateValue(el, end, formatter) {
   if (!el) return;
   const newValue = formatter(end);
   if (el.textContent === newValue) return;

   el.classList.add('shimmer-text');
   setTimeout(() => {
      el.textContent = newValue;
      el.classList.remove('shimmer-text');
      el.classList.add('animate-snap');
      setTimeout(() => el.classList.remove('animate-snap'), 500);
   }, 250);
}

export function formatDateDDMMYYYY(value) {
   if (!value) return '';
   const d = new Date(value);
   if (Number.isNaN(d.getTime())) return value;
   return d.toLocaleDateString('en-GB');
}

export function getLocalDateString(dateObj) {
   const year = dateObj.getFullYear();
   const month = String(dateObj.getMonth() + 1).padStart(2, '0');
   const day = String(dateObj.getDate()).padStart(2, '0');
   return `${year}-${month}-${day}`;
}

export function getUTCDateString(dateObj) {
   const year = dateObj.getUTCFullYear();
   const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
   const day = String(dateObj.getUTCDate()).padStart(2, '0');
   return `${year}-${month}-${day}`;
}

export function standardizeDate(val) {
   if (val === undefined || val === null || String(val).trim() === '') return null;

   let year, month, day;

   if (val instanceof Date) {
      // Dùng local time getters để tránh lệch múi giờ
      year = val.getFullYear();
      month = val.getMonth(); // 0-indexed
      day = val.getDate();
   } else if (typeof val === 'number') {
      // Excel serial number: phần nguyên = ngày, KHÔNG chuyển qua UTC milliseconds
      const totalDays = Math.floor(val);
      // Serial 25569 = 1 Jan 1970 (epoch), dùng Local Time constructor
      const refDate = new Date(1970, 0, 1 + (totalDays - 25569));
      year = refDate.getFullYear();
      month = refDate.getMonth();
      day = refDate.getDate();
   } else {
      // Chuỗi text
      const str = String(val).trim();
      try {
         const datePart = str.split(' ')[0];
         let y, m, d;

         if (datePart.includes('-')) {
            const parts = datePart.split('-');
            if (parts[0].length === 4) { y = parts[0]; m = parts[1]; d = parts[2]; }
            else if (parts[2].length === 4) { y = parts[2]; m = parts[1]; d = parts[0]; }
         } else if (datePart.includes('/')) {
            const parts = datePart.split('/');
            if (parts[2].length === 4) { y = parts[2]; m = parts[1]; d = parts[0]; }
            else if (parts[0].length === 4) { y = parts[0]; m = parts[1]; d = parts[2]; }
         }

         if (y && m && d) {
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
         }

         const fallback = new Date(str);
         if (!isNaN(fallback.getTime())) {
            return getLocalDateString(fallback);
         }
      } catch (e) { return null; }
      return null;
   }

   // Format từ year/month/day đã bóc tách
   const result = new Date(year, month, day);
   return getLocalDateString(result);
}

export function cleanNumber(val) {
   if (val === undefined || val === null || val === '') return 0;
   if (typeof val === 'number') return val;
   let str = String(val).trim();
   const isParenthesized = str.startsWith('(') && str.endsWith(')');
   let cleaned = str.replace(/[^0-9.-]+/g, "");
   let num = parseFloat(cleaned);
   if (isNaN(num)) return 0;
   return isParenthesized ? -Math.abs(num) : num;
}

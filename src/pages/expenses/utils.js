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

   if (val instanceof Date) {
      return getLocalDateString(val);
   }

   let year = 0, month = 0, day = 0;

   if (typeof val === 'number') {
      const totalDays = Math.floor(val);
      const refDate = new Date(1970, 0, 1 + (totalDays - 25569));
      return getLocalDateString(refDate);
   }

   const str = String(val).trim();
   const datePart = str.split(' ')[0];
   const sep = datePart.includes('/') ? '/' : (datePart.includes('-') ? '-' : null);

   if (sep) {
      const parts = datePart.split(sep);
      if (parts.length >= 3) {
         const p0 = parseInt(parts[0], 10);
         const p1 = parseInt(parts[1], 10);
         const p2 = parseInt(parts[2], 10);

         if (parts[0].length === 4) {
            year = p0; month = p1 - 1; day = p2;
         } else if (parts[2].length === 4) {
            year = p2;
            if (p1 > 12) {
               month = p0 - 1; day = p1;
            } else if (p0 > 12) {
               day = p0; month = p1 - 1;
            } else {
               month = p0 - 1; day = p1;
            }
         }
      }
   }

   if (!year || month < 0 || month > 11 || !day || day < 1 || day > 31) {
      const fallback = new Date(str);
      if (!isNaN(fallback.getTime())) {
         return getLocalDateString(fallback);
      }
      return null;
   }

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

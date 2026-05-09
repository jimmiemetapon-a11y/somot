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
   
   let d = null;
   if (val instanceof Date) {
      d = val;
   } else if (typeof val === 'number') {
      // Excel serial date conversion
      d = new Date(Math.round((val - 25569) * 86400 * 1000));
   }

   // Robust date extraction: Add 12 hours to handle timezone shifts up to 12h
   if (d && !isNaN(d.getTime())) {
      const midDay = new Date(d.getTime() + (12 * 60 * 60 * 1000));
      return midDay.toISOString().split('T')[0];
   }

   const str = String(val).trim();
   try {
      const datePart = str.split(' ')[0];
      if (datePart.includes('-')) {
         const parts = datePart.split('-');
         if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
         if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
      if (datePart.includes('/')) {
         const parts = datePart.split('/');
         if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
         if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
      
      const fallback = new Date(str);
      if (!isNaN(fallback.getTime())) {
         const fbMid = new Date(fallback.getTime() + (12 * 60 * 60 * 1000));
         return fbMid.toISOString().split('T')[0];
      }
   } catch (e) { return null; }
   return null;
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

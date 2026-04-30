import { auth, googleProvider } from '../firebase.js';
import { signInWithPopup, signInWithEmailAndPassword } from 'firebase/auth';

export function renderLoginPage() {
  const page = document.createElement('div');
  page.className = 'fixed inset-0 z-[9999] bg-slate-50 dark:bg-[#020617] flex flex-col md:flex-row overflow-hidden animate-fade-in';

  page.innerHTML = `
    <!-- New Premium Background -->
    <div class="fixed inset-0 bg-gradient-to-b from-[#068562] to-[#013F4A] z-[-1] overflow-hidden">
      <!-- Animated Floating Elements -->
      <div class="absolute top-[10%] left-[5%] w-[400px] h-[400px] bg-emerald-400/20 rounded-full blur-[100px] animate-blob"></div>
      <div class="absolute bottom-[20%] right-[10%] w-[350px] h-[350px] bg-teal-400/10 rounded-full blur-[80px] animate-blob animation-delay-2000"></div>
      <div class="absolute top-[40%] right-[30%] w-[250px] h-[250px] bg-white/5 rounded-full blur-[60px] animate-blob animation-delay-4000"></div>

      <!-- Financial/Verify Floating Icons (Subtle) -->
      <div class="absolute top-[15%] left-[10%] opacity-10 text-white animate-blob">
        <i data-lucide="shield-check" class="w-16 h-16"></i>
      </div>
      <div class="absolute bottom-[25%] left-[20%] opacity-5 text-white animate-blob animation-delay-2000">
        <i data-lucide="trending-up" class="w-24 h-24"></i>
      </div>
      <div class="absolute top-[45%] left-[45%] opacity-5 text-white animate-blob animation-delay-4000">
        <i data-lucide="dollar-sign" class="w-20 h-20"></i>
      </div>
      <div class="absolute bottom-[10%] left-[40%] opacity-10 text-white animate-blob">
        <i data-lucide="bar-chart-3" class="w-12 h-12"></i>
      </div>
    </div>

    <!-- Content Container -->
    <div class="flex-1 flex flex-col md:flex-row w-full h-full relative z-10 overflow-y-auto scrollbar-hide">
      <!-- Left Side: Branding (Glass Overlay on Background) -->
      <div class="hidden md:flex flex-1 items-center justify-center p-6">
        <div class="w-full max-w-md space-y-6 animate-slide-up">
          <div>
            <h1 class="text-4xl font-black tracking-tighter leading-[0.9] text-white">
              Revenue<br>
              <span class="text-emerald-300/80">Intelligence.</span>
            </h1>
            <p class="text-white/60 text-base font-medium max-w-xs mt-4 leading-relaxed">
              The definitive operating system for modern restaurant financial management and analytics.
            </p>
          </div>
          
          <div class="grid grid-cols-2 gap-6 pt-8 border-t border-white/10">
            <div class="space-y-1">
              <h4 class="text-2xl font-black tabular-nums text-white">100%</h4>
              <p class="text-[9px] uppercase tracking-[0.3em] font-bold text-emerald-400/70">Cloud Synced</p>
            </div>
            <div class="space-y-1">
              <h4 class="text-2xl font-black tabular-nums text-white">256-bit</h4>
              <p class="text-[9px] uppercase tracking-[0.3em] font-bold text-emerald-400/70">Secure Vault</p>
            </div>
          </div>
        </div>
      </div>
      <!-- Right Side: The Glass Login Card -->
      <div class="flex-1 flex items-center justify-center p-4">
        <div class="w-full max-w-md bg-white/10 backdrop-blur-[40px] border border-white/20 rounded-[2rem] p-6 md:p-8 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] space-y-4 animate-scale-up">
          <!-- Card Logo (Bold & Sharp) -->
          <div class="flex justify-center mb-4">
               <img src="/src/assets/logo-so-mot-new-01.png" alt="So Mot Logo" 
                    class="w-28 h-auto object-contain filter drop-shadow-[1px_1px_0px_rgba(255,255,255,0.8)] drop-shadow-[-1px_-1px_0px_rgba(255,255,255,0.8)] drop-shadow-[1px_-1px_0px_rgba(255,255,255,0.8)] drop-shadow-[-1px_1px_0px_rgba(255,255,255,0.8)]">
          </div>

          <div class="space-y-2 text-center">
            <h2 class="text-2xl font-black text-white tracking-tight">Access Terminal</h2>
            <p class="text-white/40 text-[10px] font-medium tracking-wide">Secure biometric or credential verification required.</p>
          </div>

          <!-- Error Message Box -->
          <div id="login-error" class="hidden p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[10px] font-bold flex items-center gap-3 animate-shake">
            <i data-lucide="alert-triangle" class="w-3.5 h-3.5"></i>
            <span id="login-error-text">Authentication failed.</span>
          </div>

          <!-- Google Login -->
          <button id="btn-google-login" class="w-full py-3.5 px-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex items-center justify-center gap-3 text-xs font-bold text-white shadow-sm transition-all group">
            <svg class="w-4 h-4 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <div class="relative flex items-center py-1">
            <div class="flex-grow border-t border-white/10"></div>
            <span class="flex-shrink-0 mx-4 text-white/20 text-[9px] font-black uppercase tracking-[0.4em]">Or Identity</span>
            <div class="flex-grow border-t border-white/10"></div>
          </div>

          <!-- Email Form -->
          <form id="login-form" class="space-y-5">
            <div class="space-y-2">
              <label class="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] ml-1">Admin Email</label>
              <div class="relative group">
                <i data-lucide="mail" class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 group-focus-within:text-emerald-400 transition-colors"></i>
                <input type="email" id="login-email" required placeholder="admin@somot.com" class="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3.5 text-xs font-bold text-white focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all outline-none placeholder:text-white/20">
              </div>
            </div>

            <div class="space-y-2">
              <div class="flex items-center justify-between ml-1">
                <label class="text-[9px] font-black text-white/40 uppercase tracking-[0.2em]">Security Key</label>
                <a href="#" class="text-[9px] font-bold text-emerald-400/60 hover:text-emerald-400 transition-colors">Recovery?</a>
              </div>
              <div class="relative group">
                <i data-lucide="lock" class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 group-focus-within:text-emerald-400 transition-colors"></i>
                <input type="password" id="login-pass" required placeholder="••••••••" class="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3.5 text-xs font-bold text-white focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all outline-none placeholder:text-white/20">
              </div>
            </div>

            <button type="submit" id="btn-email-login" class="w-full py-4 bg-white text-[#013F4A] rounded-xl font-black uppercase tracking-[0.2em] text-[11px] shadow-2xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 group">
              Access Terminal <i data-lucide="arrow-right" class="w-4 h-4 group-hover:translate-x-2 transition-transform"></i>
            </button>
          </form>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    if (window.lucide) window.lucide.createIcons();

    // Dark mode toggle inside login
    const darkBtn = page.querySelector('#login-dark-btn');
    if (darkBtn) {
      darkBtn.onclick = () => {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('darkMode', isDark ? '1' : '0');
      };
    }

    const showError = (msg) => {
      const errBox = page.querySelector('#login-error');
      const errTxt = page.querySelector('#login-error-text');
      errTxt.textContent = msg;
      errBox.classList.remove('hidden');
    };

    const setLoading = (btn, isLoading, originalHtml) => {
      if (isLoading) {
        btn.disabled = true;
        btn.innerHTML = '<div class="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>';
        btn.classList.add('opacity-80');
      } else {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
        btn.classList.remove('opacity-80');
      }
    };

    // Google Login
    const btnGoogle = page.querySelector('#btn-google-login');
    const originalGoogleHtml = btnGoogle.innerHTML;
    btnGoogle.onclick = async () => {
      setLoading(btnGoogle, true, originalGoogleHtml);
      page.querySelector('#login-error').classList.add('hidden');
      try {
        await signInWithPopup(auth, googleProvider);
        // Successful login will be caught by onAuthStateChanged in main.js
      } catch (err) {
        console.error(err);
        showError(err.message || 'Google Sign-in failed.');
        setLoading(btnGoogle, false, originalGoogleHtml);
      }
    };

    // Email Login
    const form = page.querySelector('#login-form');
    const btnEmail = page.querySelector('#btn-email-login');
    const originalEmailHtml = btnEmail.innerHTML;

    form.onsubmit = async (e) => {
      e.preventDefault();
      const email = page.querySelector('#login-email').value;
      const pass = page.querySelector('#login-pass').value;

      setLoading(btnEmail, true, originalEmailHtml);
      page.querySelector('#login-error').classList.add('hidden');

      try {
        await signInWithEmailAndPassword(auth, email, pass);
        // Successful login caught by main.js
      } catch (err) {
        console.error(err);
        // User friendly error messages
        let msg = 'Authentication failed.';
        if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
          msg = 'Invalid email or password.';
        } else if (err.code === 'auth/too-many-requests') {
          msg = 'Too many attempts. Please try again later.';
        }
        showError(msg);
        setLoading(btnEmail, false, originalEmailHtml);
      }
    };

  }, 100);

  return page;
}

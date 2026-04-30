import { auth, googleProvider } from '../firebase.js';
import { signInWithPopup, signInWithEmailAndPassword } from 'firebase/auth';

export function renderLoginPage() {
  const page = document.createElement('div');
  page.className = 'fixed inset-0 z-[9999] bg-slate-50 dark:bg-[#020617] flex flex-col md:flex-row overflow-hidden animate-fade-in';

  page.innerHTML = `
    <!-- Left Side: Branding / Visual (Hidden on small screens) -->
    <div class="hidden md:flex flex-1 relative bg-gradient-to-br from-[#96588a] via-[#8a507e] to-[#603557] overflow-hidden items-center justify-center p-12">
      <!-- Decorative Glass Circles -->
      <div class="absolute top-[-10%] left-[-10%] w-[40rem] h-[40rem] bg-white/5 rounded-full blur-3xl"></div>
      <div class="absolute bottom-[-10%] right-[-10%] w-[30rem] h-[30rem] bg-purple-500/20 rounded-full blur-3xl"></div>
      
      <div class="relative z-10 w-full max-w-lg text-white space-y-8 animate-slide-up">
        <div class="w-24 h-24 bg-white/10 backdrop-blur-md rounded-3xl p-4 border border-white/20 shadow-2xl">
          <img src="/src/assets/logo-so-mot-new-01.png" alt="So Mot Logo" class="w-full h-full object-contain filter brightness-0 invert opacity-90">
        </div>
        <div>
          <h1 class="text-5xl font-black tracking-tighter leading-tight mb-4">
            Revenue<br>
            <span class="text-purple-200">Intelligence.</span>
          </h1>
          <p class="text-white/70 text-lg font-medium max-w-md">
            The definitive operating system for modern restaurant financial management and analytics.
          </p>
        </div>
        
        <div class="grid grid-cols-2 gap-4 pt-8 border-t border-white/10">
          <div class="space-y-1">
            <h4 class="text-2xl font-black tabular-nums">100%</h4>
            <p class="text-[10px] uppercase tracking-widest font-bold text-purple-300">Cloud Synced</p>
          </div>
          <div class="space-y-1">
            <h4 class="text-2xl font-black tabular-nums">256-bit</h4>
            <p class="text-[10px] uppercase tracking-widest font-bold text-purple-300">Secure Vault</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Side: Login Form -->
    <div class="flex-1 flex items-center justify-center p-8 md:p-12 relative">
      <!-- Theme Toggle (Optional, top right) -->
      <button id="login-dark-btn" class="absolute top-8 right-8 p-3 rounded-2xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
        <i data-lucide="moon" class="w-5 h-5"></i>
      </button>

      <div class="w-full max-w-md space-y-8">
        <!-- Mobile Logo -->
        <div class="md:hidden flex justify-center mb-12">
          <img src="/src/assets/logo-so-mot-new-01.png" alt="So Mot Logo" class="h-16 w-auto object-contain dark:brightness-0 dark:invert">
        </div>

        <div class="space-y-2 text-center md:text-left">
          <h2 class="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Welcome Back</h2>
          <p class="text-slate-500 dark:text-slate-400 text-sm font-medium">Please sign in to your admin account.</p>
        </div>

        <!-- Error Message Box -->
        <div id="login-error" class="hidden p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-bold flex items-center gap-2 animate-shake">
          <i data-lucide="alert-triangle" class="w-4 h-4"></i>
          <span id="login-error-text">Authentication failed.</span>
        </div>

        <!-- Google Login -->
        <button id="btn-google-login" class="w-full py-4 px-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-center gap-3 text-sm font-bold text-slate-700 dark:text-white shadow-sm hover:shadow-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-all group">
          <svg class="w-5 h-5 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <div class="relative flex items-center py-2">
          <div class="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
          <span class="flex-shrink-0 mx-4 text-slate-400 text-[10px] font-black uppercase tracking-widest">Or email</span>
          <div class="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
        </div>

        <!-- Email Form -->
        <form id="login-form" class="space-y-5">
          <div class="space-y-1.5">
            <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
            <div class="relative">
              <i data-lucide="mail" class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
              <input type="email" id="login-email" required placeholder="admin@somot.com" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-[#96588a] focus:border-transparent transition-all outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600">
            </div>
          </div>

          <div class="space-y-1.5">
            <div class="flex items-center justify-between ml-1">
              <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Password</label>
              <a href="#" class="text-[10px] font-bold text-[#96588a] hover:underline">Forgot?</a>
            </div>
            <div class="relative">
              <i data-lucide="lock" class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
              <input type="password" id="login-pass" required placeholder="••••••••" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-[#96588a] focus:border-transparent transition-all outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600">
            </div>
          </div>

          <button type="submit" id="btn-email-login" class="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 group">
            Sign In <i data-lucide="arrow-right" class="w-4 h-4 group-hover:translate-x-1 transition-transform"></i>
          </button>
        </form>

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

// src/utils/Router.js

export class Router {
  constructor() {
    this.routes = [];
    this.currentPath = window.location.pathname;
    
    // Listen for browser Back/Forward buttons
    window.addEventListener('popstate', () => {
      this.handleRoute(window.location.pathname);
    });
  }

  /**
   * Register a route with a callback
   * @param {string} path - e.g. '/dashboard' or '/expenses/:tab'
   * @param {Function} callback - Function to execute when route matches
   */
  add(path, callback) {
    this.routes.push({
      path,
      regex: this.pathToRegex(path),
      callback
    });
    return this;
  }

  /**
   * Navigate to a path programmatically
   */
  navigate(path) {
    if (window.location.pathname === path) return;
    window.history.pushState({}, '', path);
    this.handleRoute(path);
  }

  /**
   * Trigger initial route matching
   */
  init() {
    this.handleRoute(window.location.pathname);
  }

  /**
   * Internal logic to match current URL against registered routes
   */
  handleRoute(path) {
    // Basic root handling
    const cleanPath = path === '/' ? '/dashboard' : path;
    
    let match = null;
    let params = {};

    for (const route of this.routes) {
      const result = cleanPath.match(route.regex);
      if (result) {
        match = route;
        // Extract parameters (e.g. :tab)
        const paramKeys = [...route.path.matchAll(/:([^\/]+)/g)].map(m => m[1]);
        paramKeys.forEach((key, index) => {
          params[key] = result[index + 1];
        });
        break;
      }
    }

    if (match) {
      match.callback(params);
    } else {
      console.warn(`No route found for: ${cleanPath}. Redirecting to /dashboard`);
      this.navigate('/dashboard');
    }
  }

  /**
   * Convert path string like '/expenses/:tab' to a Regex
   */
  pathToRegex(path) {
    return new RegExp('^' + path.replace(/\//g, '\\/').replace(/:[^\/]+/g, '([^\\/]+)') + '$');
  }
}

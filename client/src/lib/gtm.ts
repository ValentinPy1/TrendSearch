/**
 * Google Tag Manager (GTM) tracking utilities
 * Provides type-safe functions to push events to GTM's dataLayer
 */

// Extend Window interface to include dataLayer
declare global {
  interface Window {
    dataLayer: any[];
  }
}

/**
 * Initialize dataLayer if it doesn't exist
 */
function ensureDataLayer(): void {
  if (typeof window !== 'undefined' && !window.dataLayer) {
    window.dataLayer = [];
  }
}

/**
 * Generic event tracking function
 * Pushes an event to GTM's dataLayer
 */
export function trackEvent(
  eventName: string,
  eventData?: Record<string, any>
): void {
  if (typeof window === 'undefined') return;
  
  ensureDataLayer();
  
  const event = {
    event: eventName,
    ...eventData,
  };
  
  window.dataLayer.push(event);
}

/**
 * Track page views
 */
export function trackPageView(
  pageName: string,
  pageData?: Record<string, any>
): void {
  trackEvent('page_view', {
    page_name: pageName,
    page_path: typeof window !== 'undefined' ? window.location.pathname : '',
    page_url: typeof window !== 'undefined' ? window.location.href : '',
    ...pageData,
  });
}

/**
 * Track landing page events
 */
export const landingPageEvents = {
  pageView: () => {
    trackPageView('landing_page');
  },
  
  search: (query: string, resultCount: number) => {
    trackEvent('landing_page_search', {
      eventCategory: 'Landing Page',
      eventAction: 'Search',
      eventLabel: query,
      search_query: query,
      result_count: resultCount,
    });
  },
  
  ctaClick: (ctaType: 'get_started' | 'sign_in') => {
    trackEvent('landing_page_cta_click', {
      eventCategory: 'Landing Page',
      eventAction: 'CTA Click',
      eventLabel: ctaType,
      cta_type: ctaType,
    });
  },
};

/**
 * Track authentication events
 */
export const authEvents = {
  pageView: (mode: 'signup' | 'login') => {
    trackPageView('auth_page', {
      auth_mode: mode,
    });
  },
  
  signup: (email: string) => {
    trackEvent('signup', {
      eventCategory: 'Authentication',
      eventAction: 'Sign Up',
      eventLabel: 'Success',
      email: email,
    });
  },
  
  login: (email: string) => {
    trackEvent('login', {
      eventCategory: 'Authentication',
      eventAction: 'Login',
      eventLabel: 'Success',
      email: email,
    });
  },
  
  authError: (errorType: string, mode: 'signup' | 'login') => {
    trackEvent('auth_error', {
      eventCategory: 'Authentication',
      eventAction: mode === 'signup' ? 'Sign Up' : 'Login',
      eventLabel: 'Error',
      error_type: errorType,
      auth_mode: mode,
    });
  },
};

/**
 * Track dashboard events
 */
export const dashboardEvents = {
  pageView: () => {
    trackPageView('dashboard');
  },
  
  ideaGenerated: (ideaText: string, keywordCount: number) => {
    trackEvent('idea_generated', {
      eventCategory: 'Dashboard',
      eventAction: 'Idea Generated',
      eventLabel: ideaText.substring(0, 100), // Truncate for label
      idea_text: ideaText,
      keyword_count: keywordCount,
    });
  },
  
  keywordSearch: (query: string) => {
    trackEvent('keyword_search', {
      eventCategory: 'Dashboard',
      eventAction: 'Keyword Search',
      eventLabel: query,
      search_query: query,
    });
  },
  
  keywordView: (keyword: string) => {
    trackEvent('keyword_view', {
      eventCategory: 'Dashboard',
      eventAction: 'Keyword View',
      eventLabel: keyword,
      keyword: keyword,
    });
  },
  
  upgradeClick: (source: string) => {
    trackEvent('upgrade_click', {
      eventCategory: 'Dashboard',
      eventAction: 'Upgrade Click',
      eventLabel: source,
      upgrade_source: source,
    });
  },
};

/**
 * Track payment events
 */
export const paymentEvents = {
  checkoutInitiated: (type: 'premium' | 'credits', option: string, value?: number) => {
    trackEvent('begin_checkout', {
      eventCategory: 'Ecommerce',
      eventAction: 'Checkout Initiated',
      eventLabel: type,
      purchase_type: type,
      purchase_option: option,
      value: value,
      currency: 'EUR',
    });
  },
  
  paymentSuccess: (type: 'premium' | 'credits', option: string, value: number, transactionId?: string) => {
    trackEvent('purchase', {
      eventCategory: 'Ecommerce',
      eventAction: 'Purchase',
      eventLabel: type,
      purchase_type: type,
      purchase_option: option,
      value: value,
      currency: 'EUR',
      transaction_id: transactionId,
    });
  },
  
  paymentCancelled: (type: 'premium' | 'credits', option: string) => {
    trackEvent('payment_cancelled', {
      eventCategory: 'Ecommerce',
      eventAction: 'Payment Cancelled',
      eventLabel: type,
      purchase_type: type,
      purchase_option: option,
    });
  },
};


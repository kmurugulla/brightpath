export default {
  ci: {
    collect: {
      numberOfRuns: 1,
      settings: {
        preset: 'perf',
        formFactor: 'mobile',
        screenEmulation: {
          mobile: true,
          width: 375,
          height: 667,
          deviceScaleFactor: 2,
        },
      },
    },
    assert: {
      assertions: {
        'first-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['error', { maxNumericValue: 300 }],
        'categories:performance': ['error', { minScore: 0.9 }],
        'total-byte-weight': ['error', { maxNumericValue: 614400 }],
      },
    },
  },
};

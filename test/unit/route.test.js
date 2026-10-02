import router from '~/route';

describe('router', () => {
  test('root redirect uses localStorage landingpage when set', () => {
    const rootRoute = router.options.routes.find(route => route.path === '/');

    localStorage.landingpage = '/work-report';
    expect(rootRoute.redirect({})).toBe('/work-report');
  });

  test('root redirect falls back to /home when localStorage landingpage is missing', () => {
    const rootRoute = router.options.routes.find(route => route.path === '/');

    delete localStorage.landingpage;
    expect(rootRoute.redirect({})).toBe('/home');
  });

  test('includes the work report route', () => {
    const workReportRoute = router.options.routes.find(route => route.path === '/work-report');

    expect(workReportRoute).toBeTruthy();
    expect(typeof workReportRoute.component).toBe('function');
  });

  test('includes the full-width vision board route', () => {
    const visionBoardRoute = router.options.routes.find(route => route.path === '/vision-board');

    expect(visionBoardRoute).toBeTruthy();
    expect(typeof visionBoardRoute.component).toBe('function');
    expect(visionBoardRoute.meta).toEqual({ fullContainer: true });
  });

  test('redirects the removed timeline page to time blocking', () => {
    const timelineRoute = router.options.routes.find(route => route.path === '/timeline');

    expect(timelineRoute).toEqual({ path: '/timeline', redirect: '/time-blocking' });
  });
});

import {
  buildWorkSummaryQuery,
  buildWorkReportQuery,
  expandSelectedCategories,
  getSupportedWorkReportHosts,
  getUnsupportedWorkReportHosts,
  getWorkReportHostOptions,
} from '~/util/workReport';

const buckets = [
  {
    id: 'aw-watcher-window_laptop',
    hostname: 'laptop',
    device_id: 'laptop',
    type: 'currentwindow',
    data: {},
  },
  {
    id: 'aw-watcher-afk_laptop',
    hostname: 'laptop',
    device_id: 'laptop',
    type: 'afkstatus',
    data: {},
  },
  {
    id: 'aw-watcher-window_phone',
    hostname: 'phone',
    device_id: 'phone',
    type: 'currentwindow',
    data: {},
  },
];

describe('workReport host helpers', () => {
  test('getWorkReportHostOptions disables hosts without AFK buckets', () => {
    expect(getWorkReportHostOptions(buckets as any)).toEqual([
      { value: 'laptop', text: 'laptop', disabled: false },
      { value: 'phone', text: 'phone (requires aw-watcher-afk)', disabled: true },
    ]);
  });

  test('getUnsupportedWorkReportHosts returns selected hosts missing AFK buckets', () => {
    expect(getUnsupportedWorkReportHosts(['laptop', 'phone'], buckets as any)).toEqual(['phone']);
  });

  test('getSupportedWorkReportHosts returns only hosts with AFK buckets', () => {
    expect(getSupportedWorkReportHosts(['laptop', 'phone'], buckets as any)).toEqual(['laptop']);
  });

  test('buildWorkReportQuery uses single-arg flood() for both window and afk buckets', () => {
    // Regression: aw-query's flood() takes one argument. A previous version
    // passed breakTimeSeconds as a second argument, which made aw-server
    // respond with HTTP 400 "Tried to call function flood with invalid amount
    // of arguments" and broke the whole report.
    const query = buildWorkReportQuery(['laptop'], '[]', []);
    expect(query).toContain('events_0 = flood(query_bucket("aw-watcher-window_laptop"));');
    expect(query).toContain('not_afk_0 = flood(query_bucket("aw-watcher-afk_laptop"));');
    // Must NOT contain flood() with two arguments
    expect(query).not.toMatch(/flood\([^)]+,[^)]+\)/);
  });

  test('buildWorkReportQuery produces a snapshot-stable query for multiple hosts', () => {
    const query = buildWorkReportQuery(['laptop', 'desktop'], '[]', [['Work']]);
    expect(query).toMatchSnapshot();
  });

  test('buildWorkSummaryQuery returns active events for dashboard categorization', () => {
    const query = buildWorkSummaryQuery(['laptop'], '[]', [['Work'], ['Work', 'Programming']]);
    expect(query).toContain('active_0 = flood(query_bucket("aw-watcher-window_laptop"));');
    expect(query).toContain('active_duration = sum_durations(active);');
    expect(query).toContain(
      'RETURN = {"activeDuration": active_duration, "activeEvents": active};'
    );
    expect(query).not.toContain('work_duration');
    expect(query).not.toContain('filter_keyvals(work');
  });

  test('expandSelectedCategories includes descendants and keeps missing selected parents', () => {
    const categories = [['Work'], ['Work', 'Programming'], ['Media'], ['Media', 'Video']];
    expect(expandSelectedCategories(categories, [['Work']])).toEqual([
      ['Work'],
      ['Work', 'Programming'],
    ]);
    expect(expandSelectedCategories(categories, [['Deep', 'Work']])).toEqual([['Deep', 'Work']]);
  });

  test('getSupportedWorkReportHosts preserves selected host order', () => {
    const moreBuckets = [
      ...buckets,
      {
        id: 'aw-watcher-window_desktop',
        hostname: 'desktop',
        device_id: 'desktop',
        type: 'currentwindow',
        data: {},
      },
      {
        id: 'aw-watcher-afk_desktop',
        hostname: 'desktop',
        device_id: 'desktop',
        type: 'afkstatus',
        data: {},
      },
    ];

    expect(getSupportedWorkReportHosts(['desktop', 'phone', 'laptop'], moreBuckets as any)).toEqual(
      ['desktop', 'laptop']
    );
  });
});

window.HERCULES_STATE = {
  meta: {
    schema_version: "1.0",
    report_date: "2026-08-24",
    report_time: "09:26",
    timezone: "America/New_York",
    source: "Felipe-provided IG Manager report",
    verification: "User-provided Hercules data; not independently verified by the dashboard",
    privacy: "Public dashboard data is minimized and anonymized; no client health or identifying details are stored here."
  },
  feedback: {
    worked: [
      "30s ‘WIDER back?’ mistake-vs-fix format: 2.3x saves",
      "Average watch time: 8.9s against the reported 8.5s+ target",
      "5 DM JOURNEY attributed in the report to saves"
    ],
    flopped: [
      "60s+ tutorials: 5.2s average watch time",
      "Generic motivation quotes: 0.4% engagement",
      "Wide-lat-stretch-only framing received the qualitative feedback ‘feels wider’"
    ],
    best_times: ["07:30-08:30 EDT", "18:30-19:30 EDT"],
    today_post_time: "18:30 EDT",
    gaps: [
      "No recurring ‘What makes you WIDER?’ series yet",
      "No bilingual EN/ES 6-minute evening carousel yet",
      "No anonymous 9-5 + family barrier case yet"
    ],
    quick_win: {
      pinned_comment: "Which area to define WITHOUT widening? 1=Abdomen 2=Back 3=Arms — reply number",
      story_poll: "Do you feel WIDER after back day? Yes / No",
      follow_up: "DM voters who choose Yes"
    }
  },
  tasks: [
    {
      id: "task-2026-08-24-publish-reel-1830",
      origin_date: "2026-08-24",
      title: "Publish today’s 30s WIDER-back Reel",
      detail: "Scheduled for 6:30 PM EDT. Keep open until explicitly completed.",
      due_at: "2026-08-24T18:30:00-04:00",
      status: "open",
      kind: "post",
      carry_forward: true
    },
    {
      id: "task-2026-08-24-pin-comment",
      origin_date: "2026-08-24",
      title: "Pin the 1/2/3 definition comment",
      detail: "Which area to define WITHOUT widening? 1=Abdomen 2=Back 3=Arms — reply number",
      status: "open",
      kind: "engagement",
      carry_forward: true
    },
    {
      id: "task-2026-08-24-story-poll",
      origin_date: "2026-08-24",
      title: "Post WIDER-after-back-day story poll",
      detail: "Poll: Do you feel WIDER after back day? Yes / No",
      status: "open",
      kind: "story",
      carry_forward: true
    },
    {
      id: "task-2026-08-24-dm-yes-voters",
      origin_date: "2026-08-24",
      title: "DM Yes voters from the story poll",
      detail: "Follow up only after the poll has responses.",
      status: "open",
      kind: "lead-follow-up",
      carry_forward: true,
      depends_on: "task-2026-08-24-story-poll"
    }
  ],
  legacy_tasks: [
    {
      id: "task-2026-08-23-posted",
      origin_date: "2026-08-23",
      title: "Sunday Recovery — mark as posted",
      legacy_key: "herc_posted",
      status_if_unchecked: "superseded"
    },
    {
      id: "task-2026-08-23-story",
      origin_date: "2026-08-23",
      title: "Sunday Recovery — story done",
      legacy_key: "herc_story",
      status_if_unchecked: "superseded"
    }
  ],
  posts: [
    {
      id: "post-feedback-wider-back-measured-2026-08-24",
      lifecycle: "measured",
      title: "WIDER back? — mistake vs fix",
      source_date: "2026-08-24",
      published_date: null,
      metrics: {
        saves_multiplier: "2.3x",
        avg_watch_time: "8.9s",
        dm_journey: 5
      },
      note: "Reported as a prior-performing format in the Aug 24 feedback report; publication date was not supplied."
    },
    {
      id: "post-2026-08-24-wider-back-reset",
      lifecycle: "scheduled",
      title: "WIDER back? 6-min reset",
      format: "Reel",
      duration: "30s",
      scheduled_at: "2026-08-24T18:30:00-04:00",
      job: "reach + saves + DM JOURNEY",
      hook: "WIDER back? Mistake vs fix + 6-minute reset",
      cta: "Save + DM JOURNEY",
      privacy: "No client-identifying case details"
    },
    {
      id: "post-2026-08-25-errors-wider",
      lifecycle: "suggested",
      date: "2026-08-25",
      title: "3 errors that make you look WIDER",
      format: "Carousel EN/ES"
    },
    {
      id: "post-2026-08-26-thoracic-opener",
      lifecycle: "suggested",
      date: "2026-08-26",
      title: "Thoracic opener — define without widening",
      format: "Reel"
    },
    {
      id: "post-2026-08-27-anonymous-system",
      lifecycle: "suggested",
      date: "2026-08-27",
      title: "9-5 + family → 3x60min system",
      format: "Story + Carousel",
      privacy: "Anonymous case only"
    },
    {
      id: "post-2026-08-28-deep-squat",
      lifecycle: "suggested",
      date: "2026-08-28",
      title: "Deep squat breathing — decompress",
      format: "Reel"
    },
    {
      id: "post-2026-08-29-evening-routine",
      lifecycle: "suggested",
      date: "2026-08-29",
      title: "6-minute evening routine for busy moms",
      format: "Carousel"
    },
    {
      id: "post-2026-08-30-reset-wins",
      lifecycle: "suggested",
      date: "2026-08-30",
      title: "Sunday reset mindset + weekly wins",
      format: "Reset Reel"
    }
  ],
  insights: [
    {
      id: "insight-2026-08-24-mistake-vs-fix",
      stage: "hypothesis",
      observation: "The report says the 30s mistake-vs-fix WIDER-back format produced 2.3x saves, 8.9s average watch time and 5 DM JOURNEY.",
      interpretation: "Short mistake-vs-fix framing may be stronger for save intent and lead generation than longer tutorial framing.",
      next_test: "Repeat the mistake-vs-fix mechanism on a different body-area or technique topic while keeping duration and CTA comparable.",
      source: "Aug 24 user-provided report"
    },
    {
      id: "insight-2026-08-24-duration",
      stage: "hypothesis",
      observation: "The report says 60s+ tutorials averaged 5.2s watch time.",
      interpretation: "Long tutorial length may be creating early drop-off for this audience.",
      next_test: "Test the same educational idea in a 20-35s version before concluding duration is the cause.",
      source: "Aug 24 user-provided report"
    },
    {
      id: "insight-2026-08-24-generic-motivation",
      stage: "observation",
      observation: "Generic motivation quotes were reported at 0.4% engagement.",
      interpretation: "Generic motivation currently appears weaker than specific problem/solution content.",
      next_test: "Compare one specific action-led mindset post against one generic quote under similar posting conditions.",
      source: "Aug 24 user-provided report"
    }
  ],
  weekly_calendar: [
    {date:"2026-08-24", day:"Mon", title:"WIDER back? 6-min reset", format:"Reel 30s", time:"18:30 EDT", status:"today"},
    {date:"2026-08-25", day:"Tue", title:"3 errors that make you look WIDER", format:"Carousel EN/ES", status:"planned"},
    {date:"2026-08-26", day:"Wed", title:"Thoracic opener — define without widening", format:"Reel", status:"planned"},
    {date:"2026-08-27", day:"Thu", title:"9-5 + family → 3x60min system", format:"Story + Carousel", status:"planned", privacy:"anonymous"},
    {date:"2026-08-28", day:"Fri", title:"Deep squat breathing — decompress", format:"Reel", status:"planned"},
    {date:"2026-08-29", day:"Sat", title:"6-minute evening routine for busy moms", format:"Carousel", status:"planned"},
    {date:"2026-08-30", day:"Sun", title:"Sunday mindset + weekly wins", format:"Reset Reel", status:"planned"}
  ]
};

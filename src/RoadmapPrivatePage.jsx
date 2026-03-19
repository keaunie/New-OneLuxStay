import { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
import "./RoadmapPrivatePage.css";

const ROADMAP_ACCESS_KEY = "ols-roadmap-kurt-chase-2024-a91f7d3c";
const PROGRESS_AS_OF = "March 6, 2026";

const ITEM_STATUS = {
  completed: "completed",
  inProgress: "in-progress",
  planned: "planned",
};

const STATUS_META = {
  [ITEM_STATUS.completed]: { label: "Completed", weight: 1 },
  [ITEM_STATUS.inProgress]: { label: "In Progress", weight: 0.5 },
  [ITEM_STATUS.planned]: { label: "Planned", weight: 0 },
};

const STRATEGIC_OBJECTIVES = [
  {
    title: "Commission Reduction",
    description: "Launch proprietary direct booking ecosystem to bypass 3rd-party fees.",
    status: ITEM_STATUS.inProgress,
  },
  {
    title: "Operational Automation",
    description: "100% automation for check-ins and WiFi delivery via WhatsApp/Email.",
    status: ITEM_STATUS.inProgress,
  },
  {
    title: "Unified Team Platform",
    description:
      "Run cleaners, customers, and admins in one application with shared data, task visibility, and direct communication.",
    status: ITEM_STATUS.planned,
  },
  {
    title: "Financial Integrity",
    description: "Standardize tax collection for Antwerp, Dubai, and LA through centralized modules.",
    status: ITEM_STATUS.inProgress,
  },
  {
    title: "Growth & Reliability",
    description: "Increase direct bookings by 30% and maintain 99.9% uptime.",
    status: ITEM_STATUS.inProgress,
  },
];

const ROADMAP_PHASES = [
  {
    label: "Months 1-3",
    title: "Foundation",
    items: [
      {
        label: "Replacement for reservations.oneluxstay.com from Guesty.",
        status: ITEM_STATUS.completed,
      },
      {
        label: "Mobile App UI/UX foundation",
        status: ITEM_STATUS.completed,
      },
      {
        label: "Guesty Read-Only API integration",
        status: ITEM_STATUS.completed,
      },
      {
        label: "Booking engine",
        status: ITEM_STATUS.completed,
      },
    ],
  },
  {
    label: "Months 4-6",
    title: "Admin Panel Core",
    items: [
      {
        label: "Role-based access control",
        status: ITEM_STATUS.planned,
      },
      {
        label: "In-app messaging between cleaners, customers, and admins",
        status: ITEM_STATUS.planned,
      },
      {
        label: "Real-time calendar prices and availability dashboard",
        status: ITEM_STATUS.completed,
      },
      {
        label: "Consent form dossier",
        status: ITEM_STATUS.completed,
      },
      {
        label: "Fraud detection in Stripe",
        status: ITEM_STATUS.completed,
      },
    ],
  },
  {
    label: "Months 7-9",
    title: "Automation and Scaling",
    items: [
      {
        label: "Additional services (Food, Cars, & Experiences)",
        status: ITEM_STATUS.planned,
      },
      {
        label: "Automated WhatsApp and email triggers",
        status: ITEM_STATUS.inProgress,
      },
      {
        label: "AI Chat Engine",
        status: ITEM_STATUS.inProgress,
      },
      {
        label: "Automated reservation confirmation email",
        status: ITEM_STATUS.completed,
      },
    ],
  },
  {
    label: "Months 10-12",
    title: "Advanced Revenue Tools",
    items: [
      {
        label: "GBP 100% Verification",
        status: ITEM_STATUS.inProgress,
      },
      {
        label: "Promotion and coupon engine",
        status: ITEM_STATUS.planned,
      },
      {
        label: "Stripe Payment Automation & Notification",
        status: ITEM_STATUS.completed,
      },
    ],
  },
];

const ALIGNMENT_ROWS = [
  {
    milestone: "Phases 1 and 2",
    objective: "Commission Reduction",
    impact: "Shift traffic away from OTAs",
    progress: "In Progress",
  },
  {
    milestone: "Phase 3",
    objective: "100% Automation",
    impact: "Removes manual workload",
    progress: "In Progress",
  },
  {
    milestone: "Phase 4",
    objective: "30% Revenue Growth",
    impact: "Higher AOV and conversions",
    progress: "Planned",
  },
  {
    milestone: "Phases 1-4",
    objective: "Unified Team Platform",
    impact: "Centralized data and direct contact across all roles",
    progress: "Planned",
  },
];

const SectionTitle = ({ number, title }) => (
  <h2 className="roadmap-private-section-title">
    <span className="roadmap-private-section-badge">{number}</span>
    <span>{title}</span>
  </h2>
);

const getProgressPercent = (items = []) => {
  if (!items.length) return 0;
  const total = items.reduce((sum, item) => sum + (STATUS_META[item.status]?.weight ?? 0), 0);
  return Math.round((total / items.length) * 100);
};

const getPhaseStatus = (items = []) => {
  if (items.every((item) => item.status === ITEM_STATUS.completed)) return ITEM_STATUS.completed;
  if (items.some((item) => item.status === ITEM_STATUS.completed || item.status === ITEM_STATUS.inProgress)) {
    return ITEM_STATUS.inProgress;
  }
  return ITEM_STATUS.planned;
};

const RoadmapPrivatePage = () => {
  const { accessKey = "" } = useParams();
  const allMilestones = ROADMAP_PHASES.flatMap((phase) => phase.items);
  const completedCount = allMilestones.filter((item) => item.status === ITEM_STATUS.completed).length;
  const inProgressCount = allMilestones.filter((item) => item.status === ITEM_STATUS.inProgress).length;
  const plannedCount = allMilestones.filter((item) => item.status === ITEM_STATUS.planned).length;
  const overallProgress = getProgressPercent(allMilestones);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "OneLuxStay Roadmap";

    const robotsMeta = document.createElement("meta");
    robotsMeta.name = "robots";
    robotsMeta.content = "noindex,nofollow,noarchive";
    robotsMeta.dataset.privateRoadmap = "true";
    document.head.appendChild(robotsMeta);

    return () => {
      document.title = previousTitle;
      robotsMeta.remove();
    };
  }, []);

  if (accessKey !== ROADMAP_ACCESS_KEY) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="roadmap-private-page">
      <header className="roadmap-private-hero">
        <div className="roadmap-private-glow" />
        <div className="roadmap-private-container">
          <div className="roadmap-private-pill">Development Strategy 2026</div>
          <h1 className="roadmap-private-title">
            OneLuxStay <span>Roadmap</span>
          </h1>
          <div className="roadmap-private-subtitle">
            <span>Kurt and Chase</span>
            <span>12-Month Build & Learning Cycle</span>
          </div>
        </div>
      </header>

      <main className="roadmap-private-main roadmap-private-container">
        <section className="roadmap-private-section">
          <SectionTitle number="01" title="Progress Snapshot" />
          <div className="roadmap-private-progress">
            <article className="roadmap-private-card roadmap-private-progress-main">
              <p>Overall Completion</p>
              <strong>{overallProgress}%</strong>
              <span>
                {completedCount} of {allMilestones.length} roadmap milestones complete
              </span>
              <div className="roadmap-private-progress-bar" aria-hidden="true">
                <div style={{ width: `${overallProgress}%` }} />
              </div>
              <small>As of {PROGRESS_AS_OF}</small>
            </article>
            <article className="roadmap-private-card roadmap-private-progress-stat">
              <p>Complete</p>
              <strong>{completedCount}</strong>
            </article>
            <article className="roadmap-private-card roadmap-private-progress-stat">
              <p>In Progress</p>
              <strong>{inProgressCount}</strong>
            </article>
            <article className="roadmap-private-card roadmap-private-progress-stat">
              <p>Planned</p>
              <strong>{plannedCount}</strong>
            </article>
          </div>
        </section>

        <section className="roadmap-private-section">
          <SectionTitle number="02" title="Yearly Strategic Objectives" />
          <div className="roadmap-private-grid">
            {STRATEGIC_OBJECTIVES.map((item) => (
              <article key={item.title} className="roadmap-private-card">
                <span className={`roadmap-private-status roadmap-private-status--${item.status}`}>
                  {STATUS_META[item.status].label}
                </span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="roadmap-private-section">
          <SectionTitle number="03" title="Implementation Roadmap" />
          <div className="roadmap-private-phase-list">
            {ROADMAP_PHASES.map((phase) => (
              <article key={phase.title} className="roadmap-private-phase">
                <div className="roadmap-private-phase-head">
                  {/* <span className="roadmap-private-phase-label">{phase.label}</span> */}
                  <span
                    className={`roadmap-private-status roadmap-private-status--${getPhaseStatus(phase.items)}`}
                  >
                    {STATUS_META[getPhaseStatus(phase.items)].label}
                  </span>
                </div>
                <div className="roadmap-private-phase-title-row">
                  <h3>{phase.title}</h3>
                  <strong>{getProgressPercent(phase.items)}%</strong>
                </div>
                <div className="roadmap-private-progress-bar roadmap-private-progress-bar--phase" aria-hidden="true">
                  <div style={{ width: `${getProgressPercent(phase.items)}%` }} />
                </div>
                <div className="roadmap-private-card">
                  <ul>
                    {phase.items.map((item) => (
                      <li key={item.label} className="roadmap-private-item">
                        <span>{item.label}</span>
                        <span className={`roadmap-private-status roadmap-private-status--${item.status}`}>
                          {STATUS_META[item.status].label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="roadmap-private-section">
          <SectionTitle number="04" title="Alignment Matrix" />
          <div className="roadmap-private-table-wrap">
            <table className="roadmap-private-table">
              <thead>
                <tr>
                  <th>Milestone</th>
                  <th>Objective</th>
                  <th>Impact</th>
                  <th>Progress</th>
                </tr>
              </thead>
              <tbody>
                {ALIGNMENT_ROWS.map((row) => (
                  <tr key={`${row.milestone}-${row.objective}`}>
                    <td>{row.milestone}</td>
                    <td>{row.objective}</td>
                    <td>{row.impact}</td>
                    <td>{row.progress}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
};

export default RoadmapPrivatePage;

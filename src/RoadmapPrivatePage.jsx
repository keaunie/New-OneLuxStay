import { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
import "./RoadmapPrivatePage.css";

const ROADMAP_ACCESS_KEY = "ols-roadmap-kurt-chase-2024-a91f7d3c";

const STRATEGIC_OBJECTIVES = [
  {
    title: "Commission Reduction",
    description: "Launch proprietary direct booking ecosystem to bypass 3rd-party fees.",
  },
  {
    title: "Operational Automation",
    description: "100% automation for check-ins and WiFi delivery via WhatsApp/Email.",
  },
  {
    title: "Unified Team Platform",
    description:
      "Run cleaners, customers, and admins in one application with shared data, task visibility, and direct communication.",
  },
  {
    title: "Financial Integrity",
    description: "Standardize tax collection for Antwerp, Dubai, and LA through centralized modules.",
  },
  {
    title: "Growth & Reliability",
    description: "Increase direct bookings by 30% and maintain 99.9% uptime.",
  },
];

const ROADMAP_PHASES = [
  {
    label: "Weeks 1-3",
    title: "Foundation",
    items: [
      "High-performance listing pages (Antwerp, Dubai, LA)",
      "Mobile-first UI and 5-step booking flow",
      "Guesty Read-Only API integration",
      "Unified data model for cleaners, customers, and admins",
    ],
  },
  {
    label: "Weeks 4-6",
    title: "Admin Panel Core",
    items: [
      "Role-based access control",
      "Real-time operations dashboard",
      "VAT and city tax finance module",
      "Single app workspace with role-specific views",
    ],
  },
  {
    label: "Weeks 7-10",
    title: "Automation and Scaling",
    items: [
      "Guest account portal",
      "Automated WhatsApp and email triggers",
      "Regional tax engine",
      "In-app messaging between cleaners, customers, and admins",
    ],
  },
  {
    label: "Weeks 11-12",
    title: "Advanced Revenue Tools",
    items: [
      "Dynamic pricing system",
      "Promotion and coupon engine",
      "Upsell marketplace",
      "Central communication hub with audit history and SLAs",
    ],
  },
];

const ALIGNMENT_ROWS = [
  {
    milestone: "Phases 1 and 2",
    objective: "Commission Reduction",
    impact: "Shift traffic away from OTAs",
  },
  {
    milestone: "Phase 3",
    objective: "100% Automation",
    impact: "Removes manual workload",
  },
  {
    milestone: "Phase 4",
    objective: "30% Revenue Growth",
    impact: "Higher AOV and conversions",
  },
  {
    milestone: "Phases 1-4",
    objective: "Unified Team Platform",
    impact: "Centralized data and direct contact across all roles",
  },
];

const SectionTitle = ({ number, title }) => (
  <h2 className="roadmap-private-section-title">
    <span className="roadmap-private-section-badge">{number}</span>
    <span>{title}</span>
  </h2>
);

const RoadmapPrivatePage = () => {
  const { accessKey = "" } = useParams();

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
          <div className="roadmap-private-pill">Development Strategy 2024</div>
          <h1 className="roadmap-private-title">
            OneLuxStay <span>Roadmap</span>
          </h1>
          <div className="roadmap-private-subtitle">
            <span>Kurt and Chase</span>
            <span>12-Week Launch Cycle</span>
          </div>
        </div>
      </header>

      <main className="roadmap-private-main roadmap-private-container">
        <section className="roadmap-private-section">
          <SectionTitle number="01" title="Yearly Strategic Objectives" />
          <div className="roadmap-private-grid">
            {STRATEGIC_OBJECTIVES.map((item) => (
              <article key={item.title} className="roadmap-private-card">
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="roadmap-private-section">
          <SectionTitle number="02" title="Implementation Roadmap" />
          <div className="roadmap-private-phase-list">
            {ROADMAP_PHASES.map((phase) => (
              <article key={phase.title} className="roadmap-private-phase">
                <span className="roadmap-private-phase-label">{phase.label}</span>
                <h3>{phase.title}</h3>
                <div className="roadmap-private-card">
                  <ul>
                    {phase.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="roadmap-private-section">
          <SectionTitle number="03" title="Alignment Matrix" />
          <div className="roadmap-private-table-wrap">
            <table className="roadmap-private-table">
              <thead>
                <tr>
                  <th>Milestone</th>
                  <th>Objective</th>
                  <th>Impact</th>
                </tr>
              </thead>
              <tbody>
                {ALIGNMENT_ROWS.map((row) => (
                  <tr key={`${row.milestone}-${row.objective}`}>
                    <td>{row.milestone}</td>
                    <td>{row.objective}</td>
                    <td>{row.impact}</td>
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


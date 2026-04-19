// Display-only data for job listings and job description pages.
// Interview questions, model answers, and keywords have been moved to the backend
// and are fetched via GET /api/jobs/:id/questions when an interview session starts.

const jobRoles = [
  {
    id: 1,
    title: 'Senior Frontend Engineer',
    company: 'Google',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg',
    tags: ['React', 'TypeScript', 'Tailwind', 'JavaScript', 'HTML', 'CSS', 'Accessibility'],
    summary: 'Lead design and implementation of high-quality web applications for global users.',
    description: [
      'Build scalable UI components and architecture using React and TypeScript.',
      'Collaborate with product and design teams to define UX and delivery timelines.',
      'Write automated tests and ensure cross-browser compatibility.',
      'Continuously monitor accessibility and performance metrics in production.',
    ],
    responsibilities: [
      'Design and develop user-facing features with React.',
      'Optimize performance and bundle sizes.',
      'Coach teammates on best frontend practices.',
    ],
  },
  {
    id: 2,
    title: 'Product Manager',
    company: 'Zomato',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/b/bd/Zomato_Logo.svg',
    tags: ['Agile', 'Strategy', 'SaaS', 'Roadmap', 'Stakeholder Management'],
    summary: 'Drive product strategy and execution for cutting-edge delivery businesses.',
    description: [
      'Define product goals, metrics and roadmaps.',
      'Partner with engineering, design, operations and marketing teams.',
      'Run customer research and data-led prioritization.',
    ],
    responsibilities: [
      'Manage product backlog and release plans.',
      'Communicate status to executives and stakeholders.',
    ],
  },
  {
    id: 3,
    title: 'UX Designer',
    company: 'Paytm',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/2/24/Paytm_Logo_%28standalone%29.svg',
    tags: ['Figma', 'UI Design', 'Prototyping', 'User Research', 'Design Systems'],
    summary: 'Create delightful user experiences in finance and payments products.',
    description: [
      'Lead wireframing and prototyping in Figma.',
      'Conduct user interviews and usability tests.',
      'Implement accessible and responsive interaction patterns.',
    ],
    responsibilities: [
      'Maintain design system consistency and documentation.',
      'Work with developers for pixel-perfect handoff.',
    ],
  },
  {
    id: 4,
    title: 'Data Scientist',
    company: 'Tata Consultancy Services (TCS)',
    logoUrl: 'Logo.jpg',
    tags: ['Python', 'PyTorch', 'SQL', 'Machine Learning', 'Data Engineering'],
    summary: 'Design and deploy ML models for enterprise data-driven products.',
    description: [
      'Build end-to-end ML pipelines, from data ingestion to deployment.',
      'Perform EDA and model validation with robust metrics.',
      'Collaborate with engineering for scalable production systems.',
    ],
    responsibilities: [
      'Iterate on modeling approaches and feature engineering.',
      'Document experiments and assumptions for reproducibility.',
    ],
  },
  {
    id: 5,
    title: 'Growth Lead',
    company: 'Razorpay',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/89/Razorpay_logo.svg',
    tags: ['Marketing', 'Data Analytics', 'Growth Strategies', 'A/B Testing'],
    summary: 'Lead growth and engagement initiatives for cutting-edge fintech products.',
    description: [
      'Run paid and organic campaigns, set KPIs and funnel experiments.',
      'Analyze user behavior and retention metrics.',
      'Improve activation and referral loops.',
    ],
    responsibilities: [
      'Create growth experiments and manage execution.',
      'Report performance and optimize ROI.',
    ],
  },
];

export const knownSkills = [
  'React', 'TypeScript', 'Tailwind', 'JavaScript', 'HTML', 'CSS', 'Accessibility',
  'Agile', 'Strategy', 'SaaS', 'Roadmap', 'Stakeholder Management',
  'Figma', 'UI Design', 'Prototyping', 'User Research', 'Design Systems',
  'Python', 'PyTorch', 'SQL', 'Machine Learning', 'Data Engineering',
  'Marketing', 'Data Analytics', 'Growth Strategies', 'A/B Testing',
];

export default jobRoles;

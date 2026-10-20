/*
  ============================================================
  PORTFOLIO CONTENT — edit this file to make the site yours.
  ============================================================
  Every item can take:
    title, short (one line for the card), description (shown in the popup),
    tags: [..], link: 'https://...', image: 'assets/your-image.jpg'
  If `image` is missing, a colourful placeholder is drawn using
  `emoji` and `colors: ['#hex', '#hex']`.
  Add or remove items freely — the world grows or shrinks to fit.
*/
window.PORTFOLIO = {
  name: 'Rushi Chatur',
  role: ['3D Artist', 'UI/UX Designer', 'Front-end Dev'],
  tagline:
    'I design interfaces, build 3D worlds and bring them to life on the web. Scroll, or use W / S, to walk through my work.',

  links: {
    github: 'https://github.com/rushichatur',
    linkedin: 'https://www.linkedin.com/',
    email: 'mailto:hello@example.com',
    resume: '#',
  },

  // Each skill is a "?" block. The character jumps and hits it to reveal it.
  skills: [
    { name: 'Blender', icon: '🧊', level: 90 },
    { name: 'Three.js', icon: '🌐', level: 78 },
    { name: 'Figma', icon: '🎨', level: 92 },
    { name: 'UX Research', icon: '🔍', level: 85 },
    { name: 'Prototyping', icon: '🧩', level: 88 },
    { name: 'React', icon: '⚛️', level: 75 },
    { name: 'JavaScript', icon: '⚡', level: 80 },
    { name: 'Motion Design', icon: '🎬', level: 70 },
    { name: 'Photoshop', icon: '🖌️', level: 85 },
  ],

  projects3d: [
    {
      title: 'Low-poly Island',
      short: 'A stylised island scene with day/night lighting.',
      description:
        'A cosy low-poly island modelled and lit in Blender. Custom shaders for water, baked lighting and a turntable animation.',
      tags: ['Blender', 'Cycles', 'Lighting'],
      emoji: '🏝️',
      colors: ['#5eead4', '#3b82f6'],
      link: '#',
    },
    {
      title: 'Sneaker Product Render',
      short: 'Photoreal product shots for an e-commerce launch.',
      description:
        'Hard-surface and fabric modelling with PBR textures. Studio lighting setup and a set of 4K renders for the store page.',
      tags: ['Blender', 'Substance', 'PBR'],
      emoji: '👟',
      colors: ['#ffb4a2', '#ff6b6b'],
      link: '#',
    },
    {
      title: 'Interactive 3D Room',
      short: 'An explorable isometric room on the web.',
      description:
        'An isometric room modelled in Blender and brought to the browser with Three.js — click objects to learn about me.',
      tags: ['Three.js', 'WebGL', 'GSAP'],
      emoji: '🛋️',
      colors: ['#c4b5fd', '#7c3aed'],
      link: '#',
    },
    {
      title: 'Robot Character',
      short: 'Rigged character with a walk cycle.',
      description: 'Character design, modelling, rigging and a looping walk cycle animation.',
      tags: ['Modelling', 'Rigging', 'Animation'],
      emoji: '🤖',
      colors: ['#fde68a', '#f59e0b'],
      link: '#',
    },
  ],

  // Shown as bubbles under water.
  process: [
    { title: 'Research', icon: '🔎', text: 'Talk to users, find the real problem.' },
    { title: 'Wireframe', icon: '✏️', text: 'Sketch flows and structure fast.' },
    { title: 'Prototype', icon: '🧪', text: 'Make it clickable and test early.' },
    { title: 'Ship', icon: '🚀', text: 'Polish, hand off, measure, repeat.' },
  ],

  uiux: [
    {
      title: 'Fitness App',
      short: 'Habit-building workout app redesign.',
      description:
        'End-to-end redesign: user interviews, journey maps, wireframes and a high-fidelity Figma prototype. Onboarding drop-off fell in testing.',
      tags: ['Figma', 'Mobile', 'Case study'],
      emoji: '🏃',
      colors: ['#86efac', '#14b8a6'],
      link: '#',
    },
    {
      title: 'Banking Dashboard',
      short: 'Clear money insights for young users.',
      description:
        'A friendly finance dashboard with spending insights, goals and a modular design system.',
      tags: ['Dashboard', 'Design system'],
      emoji: '💳',
      colors: ['#93c5fd', '#6366f1'],
      link: '#',
    },
    {
      title: 'Food Delivery',
      short: 'Faster ordering in three taps.',
      description: 'Simplified ordering flow, accessible colour palette and micro-interactions.',
      tags: ['UX', 'Prototype', 'Motion'],
      emoji: '🍜',
      colors: ['#fdba74', '#f43f5e'],
      link: '#',
    },
  ],

  // Hung on a rope like posters.
  designs: [
    { title: 'Music Fest Poster', type: 'Poster', emoji: '🎸', colors: ['#f472b6', '#8b5cf6'] },
    { title: 'Coffee Brand', type: 'Branding', emoji: '☕', colors: ['#fcd34d', '#b45309'] },
    { title: 'App Icon Set', type: 'Icons', emoji: '🧩', colors: ['#67e8f9', '#2563eb'] },
    { title: 'Eco Campaign', type: 'Social', emoji: '🌱', colors: ['#bef264', '#16a34a'] },
    { title: 'Tech Meetup', type: 'Poster', emoji: '🛰️', colors: ['#a5b4fc', '#1e1b4b'] },
    { title: 'Logo Collection', type: 'Logos', emoji: '✳️', colors: ['#fda4af', '#e11d48'] },
  ],

  // Road signs on the hill-climb drive.
  experience: [
    { year: '2019', title: 'Started with Blender', place: 'Self-taught', text: 'First donut, first render, hooked.' },
    { year: '2021', title: 'Design course', place: 'UI/UX certification', text: 'Research, wireframes, usability.' },
    { year: '2022', title: 'Freelance', place: 'Clients worldwide', text: '3D renders and app designs.' },
    { year: '2024', title: 'Product Designer', place: 'Your company', text: 'Designing and shipping real products.' },
  ],

  // The flying section — your best work.
  premium: [
    {
      title: '3D Product Configurator',
      short: 'Customise a product in real time in the browser.',
      description:
        'A WebGL configurator: swap colours and materials live, with a UI designed from user research. Built with Three.js and React.',
      tags: ['Three.js', 'React', 'UX'],
      emoji: '🎮',
      colors: ['#f0abfc', '#6366f1'],
      link: '#',
    },
    {
      title: 'Immersive Brand World',
      short: 'A scroll-driven 3D story for a brand launch.',
      description: 'Concept, 3D assets, motion and front-end build for an award-style launch site.',
      tags: ['WebGL', 'Motion', 'Storytelling'],
      emoji: '🌌',
      colors: ['#fcd34d', '#ef4444'],
      link: '#',
    },
    {
      title: 'AR Furniture Viewer',
      short: 'Place 3D furniture in your room.',
      description: 'Optimised 3D models and an AR flow that lets shoppers preview furniture at real size.',
      tags: ['AR', '3D', 'Mobile UX'],
      emoji: '🪑',
      colors: ['#5eead4', '#0ea5e9'],
      link: '#',
    },
  ],

  contact: {
    title: "Let's build something fresh",
    text: 'Open to freelance projects, full-time roles and fun collaborations. Say hi!',
  },
};

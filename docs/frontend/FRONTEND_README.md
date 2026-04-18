# Frontend Architecture & Setup

This directory contains the React single-page application built with Vite for the Biometric Face Attendance System.

## Tech Stack
- **Framework**: React 19
- **Build Tool**: Vite 8
- **Styling**: Vanilla CSS with modern custom properties, Flexbox/Grid. *Note: Tailwind CSS is installed but vanilla CSS is preferred for the design system.*
- **Routing**: React Router DOM (v6/v7)
- **Icons**: React Icons (Heroicons/Lucide)
- **HTTP Client**: Axios (configured for cookies and CSRF)
- **Testing**: Playwright for E2E testing

## Key Features
- **Mobile-First Responsive UI**: All dashboards, tables, and nested forms are fully responsive, gracefully degrading to card-based stacks on mobile devices.
- **Role-Based Access Control**: Protected routes and specific UI layouts mapped to `admin`, `department_admin`, `lecturer`, and `student` roles.
- **Optimistic UI & Hydration**: Advanced error boundaries and dynamic suspense wrappers.
- **Biometric UI Pipeline**: Built-in webcam capture flows with centering capabilities and image cropping for face enrollment/attendance.

## Development Setup

```bash
# 1. Install dependencies
npm install

# 2. Run the development server (uses Vite)
npm run dev

# 3. Lint the codebase
npm run lint

# 4. Build for production (outputs to /dist)
npm run build
```

## E2E Testing Strategy

The frontend embraces Playwright for true End-to-End browser testing.

```bash
# Run all playwright tests in UI mode
npm run test:e2e -- --ui

# Run headless tests (CI mode)
npm run test:e2e
```

**Testing Highlights**:
- Fully mocked backend (`installApiMocks`) ensures tests run independently of the database.
- Explicit Vite path checking during interception fixes "infinite load" sub-chunking issues.
- Responsive design constraints are explicitly tested (e.g., mobile overflow boundaries).
- Accessibility and high-contrast logging texts are asserted.

## Styling Guidelines

The application strictly enforces a high-end, dynamic aesthetic:
1. `index.css`: Houses all core tokens `--color-text-primary`, `--bg-primary`, `--bg-cards`.
2. Responsive Breakpoints: Handled via `@media (max-width: 768px)` blocks converting grids/tables into stackable layouts.
3. Shadows & Glassmorphism: Variables like `var(--elevation-2)` are used to establish depth.
4. Smooth transitions and hover scaling are heavily encouraged for interactive components.

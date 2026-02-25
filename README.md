# Rigel Business - Enterprise Accounting Solution

A comprehensive accounting and financial management system built for South African enterprises with multi-branch support.

## Features

### Core Accounting
- **Dashboard**: Real-time financial overview with key metrics
- **Transactions**: Complete transaction management with journal entries
- **Trial Balance**: Automated trial balance generation and reporting
- **Financial Reports**: Comprehensive AFS, P&L, and Balance Sheet

### Sales & Purchase
- **Invoices**: Create, manage, and email professional invoices
- **Sales Quotes**: Generate quotes and convert to invoices with one click
- **Sales Module**: Track sales transactions and revenue
- **Purchase Module**: Manage purchases and expenses

### Assets & Compliance
- **Fixed Assets Register**: Track depreciation and asset lifecycle
- **VAT Management**: Automated VAT calculations and returns
- **Tax Compliance**: South African tax compliance tools

### Multi-Branch Support
- Branch selector for companies with 3+ branches
- Branch-filtered data across all modules
- Centralized company management

### User Roles & Permissions
- **Administrator**: Full system access
- **Accountant**: Manage transactions, reports, and financial data
- **Manager**: View-only access to dashboards and reports

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Supabase (Auth + Database + RLS)
- **UI**: TailwindCSS + shadcn/ui components
- **State Management**: React Query
- **Routing**: React Router v6

## Getting Started

### Prerequisites
- Node.js 18+ or Bun
- Supabase account (already configured)

### Installation

```bash
# Install dependencies
npm install
# or
bun install

# Start development server
npm run dev
# or
bun dev
```

### Environment Setup
No environment variables needed - Supabase is pre-configured via integrations.

## Project Structure

```
src/
├── components/
│   ├── Layout/          # Dashboard layout components
│   ├── ui/              # shadcn UI components
│   └── ...              # Feature components
├── pages/               # Route pages
├── hooks/               # Custom React hooks
├── lib/                 # Utilities and API clients
├── context/             # React context providers
└── integrations/        # Supabase integration
```

## Database Schema

- **companies**: Multi-company support
- **branches**: Branch management
- **profiles**: User profiles
- **user_roles**: Role-based permissions
- **transactions**: Financial transactions
- **transaction_entries**: Journal entries
- **trial_balances**: Trial balance records
- **invoices**: Customer invoices
- **quotes**: Sales quotes
- **fixed_assets**: Asset register
- **chart_of_accounts**: CoA structure

## Security

- Row Level Security (RLS) enforced on all tables
- Role-based access control
- Secure authentication via Supabase Auth
- Input validation with Zod schemas

## Deployment

### Production Build
```bash
npm run build
# or
bun run build
```

### Deploy to EC2
1. Build the project
2. Upload `dist/` folder to EC2
3. Configure nginx/Apache to serve static files
4. Ensure Supabase URL is accessible from production

## Features Roadmap

- [x] Multi-branch support
- [x] Role-based permissions
- [x] Fixed assets register
- [x] Invoice & quote management
- [ ] Email integration (Resend)
- [ ] PDF generation for reports
- [ ] Service-based sales
- [ ] Stock validation
- [ ] Cost of Sales automation
- [ ] Advanced analytics

## Support

For issues or questions, contact the Rigel Business team.

## License

Proprietary - All rights reserved

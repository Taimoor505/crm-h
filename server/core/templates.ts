/* Industry templates with generic English keys (brief §12.4). Source of truth for new workspaces; GET /templates serves them. */
export interface TemplateDef { key: string; name: string; description: string; pipelines: { name: string; stages: { name: string; kind: 'open' | 'won' | 'lost' }[] }[]; custom_fields: { entity: 'contact' | 'deal'; key: string; label: string; type: string; options?: string[] }[] }

export const TEMPLATES: TemplateDef[] = [
  {
    key: 'real_estate',
    name: 'Real estate',
    description: 'Buyers, sellers and tenants, from enquiry to viewing to closing.',
    pipelines: [
      {
        name: 'Sales',
        stages: [
          { name: 'New enquiry', kind: 'open' },
          { name: 'Contacted', kind: 'open' },
          { name: 'Viewing booked', kind: 'open' },
          { name: 'Offer made', kind: 'open' },
          { name: 'Deposit paid', kind: 'open' },
          { name: 'Won', kind: 'won' },
          { name: 'Lost', kind: 'lost' },
        ],
      },
      {
        name: 'Rentals',
        stages: [
          { name: 'New enquiry', kind: 'open' },
          { name: 'Viewing booked', kind: 'open' },
          { name: 'Application', kind: 'open' },
          { name: 'Leased', kind: 'won' },
          { name: 'Lost', kind: 'lost' },
        ],
      },
    ],
    custom_fields: [
      { entity: 'contact', key: 'location', label: 'Preferred location', type: 'text' },
      { entity: 'contact', key: 'budget', label: 'Budget', type: 'money' },
      { entity: 'contact', key: 'property_type', label: 'Property type', type: 'select', options: ['Apartment', 'House', 'Villa', 'Plot', 'Commercial'] },
      { entity: 'deal', key: 'size', label: 'Size', type: 'area' },
      { entity: 'deal', key: 'unit_ref', label: 'Unit / plot reference', type: 'text' },
      { entity: 'deal', key: 'deposit_date', label: 'Deposit date', type: 'date' },
    ],
  },
  {
    key: 'law',
    name: 'Law firm',
    description: 'Prospective clients from first consultation to signed engagement.',
    pipelines: [
      {
        name: 'New matters',
        stages: [
          { name: 'Enquiry', kind: 'open' },
          { name: 'Consultation booked', kind: 'open' },
          { name: 'Proposal sent', kind: 'open' },
          { name: 'Engagement signed', kind: 'won' },
          { name: 'Declined', kind: 'lost' },
        ],
      },
    ],
    custom_fields: [
      { entity: 'contact', key: 'matter_type', label: 'Matter type', type: 'select', options: ['Family', 'Property', 'Corporate', 'Employment', 'Criminal', 'Immigration'] },
      { entity: 'contact', key: 'referred_by', label: 'Referred by', type: 'text' },
      { entity: 'deal', key: 'court', label: 'Court / forum', type: 'text' },
      { entity: 'deal', key: 'next_hearing_date', label: 'Next hearing', type: 'date' },
    ],
  },
  {
    key: 'distributor',
    name: 'Distributor / Wholesale',
    description: 'Retailers and outlets, from first visit to repeat orders.',
    pipelines: [
      {
        name: 'Outlet onboarding',
        stages: [
          { name: 'Lead', kind: 'open' },
          { name: 'Visit done', kind: 'open' },
          { name: 'Sample order', kind: 'open' },
          { name: 'Negotiation', kind: 'open' },
          { name: 'Active account', kind: 'won' },
          { name: 'Lost', kind: 'lost' },
        ],
      },
    ],
    custom_fields: [
      { entity: 'contact', key: 'city', label: 'City', type: 'text' },
      { entity: 'contact', key: 'outlet_type', label: 'Outlet type', type: 'select', options: ['Retail', 'Wholesale', 'Pharmacy', 'Supermarket', 'Online'] },
      { entity: 'deal', key: 'credit_limit', label: 'Credit limit', type: 'money' },
      { entity: 'deal', key: 'payment_terms', label: 'Payment terms', type: 'select', options: ['Cash', '7 days', '15 days', '30 days'] },
    ],
  },
  {
    key: 'clinic',
    name: 'Clinic',
    description: 'Patient enquiries, from first call to booked treatment.',
    pipelines: [
      {
        name: 'Patients',
        stages: [
          { name: 'Enquiry', kind: 'open' },
          { name: 'Appointment booked', kind: 'open' },
          { name: 'Consulted', kind: 'open' },
          { name: 'Treatment booked', kind: 'won' },
          { name: 'Not proceeding', kind: 'lost' },
        ],
      },
    ],
    custom_fields: [
      { entity: 'contact', key: 'procedure', label: 'Procedure of interest', type: 'text' },
      { entity: 'contact', key: 'appointment_date', label: 'Appointment date', type: 'date' },
      { entity: 'deal', key: 'treatment_plan', label: 'Treatment plan', type: 'text' },
    ],
  },
  {
    key: 'agency',
    name: 'Agency / Services',
    description: 'Projects and retainers, from brief to signed proposal.',
    pipelines: [
      {
        name: 'New business',
        stages: [
          { name: 'Lead', kind: 'open' },
          { name: 'Discovery call', kind: 'open' },
          { name: 'Proposal sent', kind: 'open' },
          { name: 'Negotiation', kind: 'open' },
          { name: 'Signed', kind: 'won' },
          { name: 'Lost', kind: 'lost' },
        ],
      },
    ],
    custom_fields: [
      { entity: 'contact', key: 'company', label: 'Company', type: 'text' },
      { entity: 'contact', key: 'service', label: 'Service', type: 'select', options: ['Branding', 'Website', 'Marketing', 'Consulting', 'Support'] },
      { entity: 'deal', key: 'start_date', label: 'Start date', type: 'date' },
    ],
  },
  {
    key: 'general',
    name: 'General',
    description: 'A simple sales pipeline for any business that sells.',
    pipelines: [
      {
        name: 'Sales',
        stages: [
          { name: 'New', kind: 'open' },
          { name: 'Contacted', kind: 'open' },
          { name: 'Qualified', kind: 'open' },
          { name: 'Proposal', kind: 'open' },
          { name: 'Won', kind: 'won' },
          { name: 'Lost', kind: 'lost' },
        ],
      },
    ],
    custom_fields: [
      { entity: 'contact', key: 'company', label: 'Company', type: 'text' },
    ],
  },
];

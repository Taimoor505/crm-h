import { IndustryTemplate } from './types';

export const LAUNCH_INDUSTRY_TEMPLATES: IndustryTemplate[] = [
  {
    id: '10000000-0000-0000-0000-000000000001',
    key: 'real_estate',
    name_en: 'Real Estate & Property Dealers',
    name_ur: 'رئیل اسٹیٹ اور پراپرٹی ڈیلرز',
    description_en:
      'Built for DHA, Bahria Town, and housing society agencies managing plot files, site visits, token money (بیعانہ), and transfer closings.',
    description_ur:
      'ڈی ایچ اے، بحریہ ٹاؤن اور ہاؤسنگ سوسائٹی ایجنسیوں کے لیے پلاٹ فائلز، سائٹ وزٹ، بیعانہ اور ٹرانسفر کلوزنگ کا مکمل نظام۔',
    definition: {
      pipelines: [
        {
          name: 'Property Sales Pipeline',
          name_ur: 'پراپرٹی سیلز پائپ لائن',
          stages: [
            { name: 'New Inquiry', name_ur: 'نئی انکوائری', kind: 'open' },
            { name: 'Site Visit Scheduled', name_ur: 'سائٹ وزٹ طے', kind: 'open' },
            { name: 'Token / Bayana', name_ur: 'ٹوکن / بیعانہ', kind: 'open' },
            { name: 'Transfer & NDC', name_ur: 'ٹرانسفر اور این ڈی سی', kind: 'open' },
            { name: 'Closed Won', name_ur: 'ڈیل مکمل', kind: 'won' },
            { name: 'Lost / Dropped', name_ur: 'ڈیل منسوخ', kind: 'lost' },
          ],
        },
      ],
      custom_fields: [
        {
          entity: 'contact',
          key: 'society',
          label_en: 'Preferred Society / Sector',
          label_ur: 'پسندیدہ سوسائٹی / سیکٹر',
          type: 'select',
          options: [
            'DHA Lahore Phase 6-8',
            'DHA Karachi Phase 8',
            'Bahria Town Rawalpindi',
            'Capital Smart City',
            'LDA City',
          ],
          required: false,
        },
        {
          entity: 'contact',
          key: 'budget_pkr',
          label_en: 'Max Budget (PKR)',
          label_ur: 'زیادہ سے زیادہ بجٹ (روپے)',
          type: 'money',
          required: false,
        },
        {
          entity: 'deal',
          key: 'plot_size',
          label_en: 'Plot / Property Size',
          label_ur: 'پلاٹ کا سائز',
          type: 'select',
          options: ['5 Marla', '10 Marla', '1 Kanal', '2 Kanal', 'Commercial 4 Marla'],
          required: true,
        },
        {
          entity: 'deal',
          key: 'file_or_plot_no',
          label_en: 'Plot / File Number',
          label_ur: 'پلاٹ / فائل نمبر',
          type: 'text',
          required: false,
        },
        {
          entity: 'deal',
          key: 'bayana_date',
          label_en: 'Bayana Due Date',
          label_ur: 'بیعانہ کی تاریخ',
          type: 'date',
          required: false,
        },
      ],
      sample_contacts: [
        {
          name: 'Tariq Mahmood (طارق محمود)',
          phone: '0300-4455667',
          email: 'tariq.mahmood@example.pk',
          source: 'Zameen.com',
          status: 'hot',
          tags: ['DHA Phase 8', '1 Kanal', 'Cash Buyer'],
          custom: {
            society: 'DHA Lahore Phase 6-8',
            budget_pkr: 48500000,
          },
          deal: {
            title: '1 Kanal Residential Plot — DHA Phase 8 Block T',
            value_pkr: 47500000,
            stage_index: 2,
            custom: {
              plot_size: '1 Kanal',
              file_or_plot_no: 'T-412',
              bayana_date: '2026-11-22',
            },
          },
        },
        {
          name: 'Sanaullah Khan',
          phone: '0321-9988776',
          source: 'WhatsApp Inbound',
          status: 'qualified',
          tags: ['Bahria Town', '10 Marla'],
          custom: {
            society: 'Bahria Town Rawalpindi',
            budget_pkr: 22000000,
          },
          deal: {
            title: '10 Marla Possession Plot — Bahria Phase 8',
            value_pkr: 21500000,
            stage_index: 1,
            custom: {
              plot_size: '10 Marla',
              file_or_plot_no: 'Sector E-198',
            },
          },
        },
      ],
    },
  },
  {
    id: '10000000-0000-0000-0000-000000000002',
    key: 'law',
    name_en: 'Law Offices & Advocates',
    name_ur: 'لاء فرمز اور وکلاء',
    description_en:
      'Designed for Pakistani High Court chambers, corporate retainers, civil/family litigation intake, and hearing fee tracking.',
    description_ur:
      'ہائی کورٹ چیمبرز، کارپوریٹ ریٹینرز، سول و فیملی مقدمات اور فیس ٹریکنگ کے لیے موزوں۔',
    definition: {
      pipelines: [
        {
          name: 'Case & Retainer Intake',
          name_ur: 'مقدمات اور ریٹینر پائپ لائن',
          stages: [
            { name: 'Consultation Request', name_ur: 'مشاورت کی درخواست', kind: 'open' },
            { name: 'Document Review', name_ur: 'دستاویزات کا جائزہ', kind: 'open' },
            { name: 'Wakalatnama & Retainer', name_ur: 'وکالت نامہ اور فیس', kind: 'open' },
            { name: 'Active Matter', name_ur: 'فعال مقدمہ', kind: 'won' },
            { name: 'Declined / Conflict', name_ur: 'معذرت / مسترد', kind: 'lost' },
          ],
        },
      ],
      custom_fields: [
        {
          entity: 'contact',
          key: 'cnic_last4',
          label_en: 'CNIC Last 4 Digits',
          label_ur: 'شناختی کارڈ کے آخری 4 ہندسے',
          type: 'text',
          required: false,
        },
        {
          entity: 'deal',
          key: 'court_forum',
          label_en: 'Court / Forum',
          label_ur: 'عدالت / فورم',
          type: 'select',
          options: [
            'Lahore High Court',
            'Sindh High Court',
            'Islamabad High Court',
            'District & Sessions Court',
            'Corporate / SECP Advisory',
          ],
          required: true,
        },
        {
          entity: 'deal',
          key: 'matter_type',
          label_en: 'Matter Category',
          label_ur: 'مقدمہ کی نوعیت',
          type: 'select',
          options: ['Civil Suit', 'Writ Petition', 'Corporate Retainer', 'Tax / FBR', 'Family Law'],
          required: true,
        },
        {
          entity: 'deal',
          key: 'next_hearing_date',
          label_en: 'Next Hearing Date',
          label_ur: 'اگلی پیشی کی تاریخ',
          type: 'date',
          required: false,
        },
      ],
      sample_contacts: [
        {
          name: 'Mian Usman Farooq (میاں عثمان فاروق)',
          phone: '0333-4112233',
          email: 'usman@alrafiqtextiles.pk',
          source: 'Referral',
          status: 'active',
          tags: ['Corporate', 'FBR Notice'],
          custom: { cnic_last4: '7841' },
          deal: {
            title: 'FBR Sales Tax Writ — Lahore High Court',
            value_pkr: 650000,
            stage_index: 2,
            custom: {
              court_forum: 'Lahore High Court',
              matter_type: 'Tax / FBR',
              next_hearing_date: '2026-11-28',
            },
          },
        },
      ],
    },
  },
  {
    id: '10000000-0000-0000-0000-000000000003',
    key: 'distributor',
    name_en: 'FMCG & Wholesale Distributors',
    name_ur: 'تھوک فروش اور ڈسٹری بیوٹرز',
    description_en:
      'Built for regional sales teams onboarding kiryana retailers, pharmacies, hardware dealers, and B2B wholesale accounts across Pakistani mandis.',
    description_ur:
      'علاقائی سیلز ٹیموں، ریٹیلرز، میڈیکل اسٹورز اور ہول سیل منڈی ڈیلرز کی آن بورڈنگ کے لیے۔',
    definition: {
      pipelines: [
        {
          name: 'Dealer Onboarding & Orders',
          name_ur: 'ڈیلر آن بورڈنگ اور آرڈرز',
          stages: [
            { name: 'Prospect Shop', name_ur: 'نیا دکاندار', kind: 'open' },
            { name: 'Rate List Sent', name_ur: 'ریٹ لسٹ ارسال', kind: 'open' },
            { name: 'Credit Limit Approved', name_ur: 'کریڈٹ لمٹ منظور', kind: 'open' },
            { name: 'First Order Booked', name_ur: 'پہلا آرڈر بک', kind: 'won' },
            { name: 'Inactive / Rejected', name_ur: 'غیر فعال', kind: 'lost' },
          ],
        },
      ],
      custom_fields: [
        {
          entity: 'contact',
          key: 'city_zone',
          label_en: 'City / Mandi Zone',
          label_ur: 'شہر / منڈی زون',
          type: 'select',
          options: [
            'Lahore Shah Alam Market',
            'Karachi Jodia Bazar',
            'Faisalabad Clock Tower',
            'Multan Cantt',
            'Peshawar Karkhano',
          ],
          required: false,
        },
        {
          entity: 'contact',
          key: 'credit_limit_pkr',
          label_en: 'Approved Credit Limit (PKR)',
          label_ur: 'منظور شدہ کریڈٹ حد (روپے)',
          type: 'money',
          required: false,
        },
        {
          entity: 'deal',
          key: 'sku_bundle',
          label_en: 'Product Line / Category',
          label_ur: 'پروڈکٹ کیٹیگری',
          type: 'select',
          options: ['FMCG Beverages', 'Cooking Oil & Ghee', 'Pharma OTC', 'Solar & Electrical'],
          required: true,
        },
        {
          entity: 'deal',
          key: 'monthly_target_pkr',
          label_en: 'Monthly Volume Target (PKR)',
          label_ur: 'ماہانہ ہدف (روپے)',
          type: 'money',
          required: false,
        },
      ],
      sample_contacts: [
        {
          name: 'Haji Barkat Ali Traders (حاجی برکت علی ٹریڈرز)',
          phone: '0301-7766554',
          source: 'Field Beat',
          status: 'qualified',
          tags: ['Shah Alam', 'Tier-A Dealer'],
          custom: {
            city_zone: 'Lahore Shah Alam Market',
            credit_limit_pkr: 1500000,
          },
          deal: {
            title: 'Monthly Cooking Oil Carton Allocation',
            value_pkr: 1250000,
            stage_index: 2,
            custom: {
              sku_bundle: 'Cooking Oil & Ghee',
              monthly_target_pkr: 1250000,
            },
          },
        },
      ],
    },
  },
  {
    id: '10000000-0000-0000-0000-000000000004',
    key: 'clinic',
    name_en: 'Clinics & Aesthetics Centers',
    name_ur: 'کلینکس اور ہیلتھ سینٹرز',
    description_en:
      'Tailored for dental, dermatology, laser, and diagnostic clinics converting WhatsApp & Instagram inquiries into booked procedures.',
    description_ur:
      'ڈینٹل، ڈرماٹولوجی اور میڈیکل سینٹرز کے لیے واٹس ایپ اور سوشل میڈیا مریضوں کی اپائنٹمنٹ کنورژن۔',
    definition: {
      pipelines: [
        {
          name: 'Patient Consultation Funnel',
          name_ur: 'مریض مشاورت فنل',
          stages: [
            { name: 'WhatsApp Inquiry', name_ur: 'واٹس ایپ انکوائری', kind: 'open' },
            { name: 'Appointment Booked', name_ur: 'اپائنٹمنٹ طے', kind: 'open' },
            { name: 'Consultation Done', name_ur: 'معائنہ مکمل', kind: 'open' },
            { name: 'Treatment Enrolled', name_ur: 'علاج شروع', kind: 'won' },
            { name: 'No Show / Cancelled', name_ur: 'منسوخ', kind: 'lost' },
          ],
        },
      ],
      custom_fields: [
        {
          entity: 'contact',
          key: 'whatsapp_opt_in',
          label_en: 'Appointment Reminder Channel',
          label_ur: 'ریمائنڈر کا ذریعہ',
          type: 'select',
          options: ['WhatsApp', 'Phone Call', 'SMS'],
          required: false,
        },
        {
          entity: 'deal',
          key: 'procedure_type',
          label_en: 'Procedure / Package',
          label_ur: 'علاج / پیکج',
          type: 'select',
          options: ['Dental Implant', 'Orthodontics', 'PRP / Laser Session', 'Executive Checkup'],
          required: true,
        },
        {
          entity: 'deal',
          key: 'appointment_date',
          label_en: 'Preferred Visit Date',
          label_ur: 'مطلوبہ تاریخ',
          type: 'date',
          required: false,
        },
      ],
      sample_contacts: [
        {
          name: 'Ayesha Siddiqui (عائشہ صدیقی)',
          phone: '0345-2233445',
          source: 'Instagram Ad',
          status: 'booked',
          tags: ['Clifton Branch', 'Orthodontics'],
          custom: { whatsapp_opt_in: 'WhatsApp' },
          deal: {
            title: 'Clear Aligner Assessment Package',
            value_pkr: 185000,
            stage_index: 1,
            custom: {
              procedure_type: 'Orthodontics',
              appointment_date: '2026-11-19',
            },
          },
        },
      ],
    },
  },
  {
    id: '10000000-0000-0000-0000-000000000005',
    key: 'general',
    name_en: 'General B2B & Services CRM',
    name_ur: 'عمومی کاروباری سی آر ایم',
    description_en:
      'Clean default sales pipeline for software agencies, solar installers, travel agencies, and any business that sells via calls and WhatsApp.',
    description_ur:
      'سولر، ٹریول، آئی ٹی سروسز اور ہر کاروبار کے لیے سادہ اور تیز سیلز پائپ لائن۔',
    definition: {
      pipelines: [
        {
          name: 'Standard Sales Pipeline',
          name_ur: 'معیاری سیلز پائپ لائن',
          stages: [
            { name: 'New Lead', name_ur: 'نیا لیڈ', kind: 'open' },
            { name: 'Contacted', name_ur: 'رابطہ ہو گیا', kind: 'open' },
            { name: 'Proposal Sent', name_ur: 'تجویز ارسال', kind: 'open' },
            { name: 'Won', name_ur: 'کامیاب', kind: 'won' },
            { name: 'Lost', name_ur: 'ناکام', kind: 'lost' },
          ],
        },
      ],
      custom_fields: [
        {
          entity: 'contact',
          key: 'city',
          label_en: 'City',
          label_ur: 'شہر',
          type: 'text',
          required: false,
        },
        {
          entity: 'deal',
          key: 'payment_terms',
          label_en: 'Payment Terms',
          label_ur: 'ادائیگی کی شرائط',
          type: 'select',
          options: ['100% Advance', '50% Advance / 50% Delivery', '30 Days Credit'],
          required: false,
        },
      ],
      sample_contacts: [
        {
          name: 'Bilal Ahmed — Indus Solar Solutions',
          phone: '0312-5544332',
          email: 'bilal@indussolar.pk',
          source: 'Website Form',
          status: 'open',
          tags: ['10kW Hybrid', 'Islamabad'],
          custom: { city: 'Islamabad' },
          deal: {
            title: '10kW Hybrid Solar Installation — F-10',
            value_pkr: 1450000,
            stage_index: 2,
            custom: { payment_terms: '50% Advance / 50% Delivery' },
          },
        },
      ],
    },
  },
];

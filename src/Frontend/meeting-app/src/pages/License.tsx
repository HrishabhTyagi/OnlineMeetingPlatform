import { FormEvent, useEffect, useMemo, useState, type SVGProps } from 'react';
import AppShell from '../components/AppShell';
import { licenseAPI } from '../services/api';
import { useAuthStore } from '../store/authStore';

interface LicensePlan {
  id: string;
  name: string;
  monthlyPrice: number;
  annualMonthlyPrice: number;
  seatLimit: string;
  storage: string;
  support: string;
}

interface CheckoutForm {
  companyName: string;
  contactName: string;
  contactEmail: string;
  phone: string;
  notes: string;
  cardholderName: string;
  cardNumber: string;
  expiry: string;
  cvc: string;
}

const plans: LicensePlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: 399,
    annualMonthlyPrice: 319,
    seatLimit: 'Up to 50 seats',
    storage: '50 GB included',
    support: 'Email support',
  },
  {
    id: 'team',
    name: 'Team',
    monthlyPrice: 699,
    annualMonthlyPrice: 559,
    seatLimit: 'Up to 250 seats',
    storage: '500 GB included',
    support: 'Priority support',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyPrice: 1199,
    annualMonthlyPrice: 959,
    seatLimit: 'Unlimited seats',
    storage: 'Custom storage',
    support: 'Dedicated support',
  },
];

function ShieldIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 3.5 19 6v5.5c0 4.4-2.7 7.6-7 9-4.3-1.4-7-4.6-7-9V6l7-2.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8.5 12.2 10.8 14.5l4.7-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M4.5 7A2.5 2.5 0 0 1 7 4.5h10A2.5 2.5 0 0 1 19.5 7v10A2.5 2.5 0 0 1 17 19.5H7A2.5 2.5 0 0 1 4.5 17V7Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4.5 9.5h15M7.5 15h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MailIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M4.5 7A2.5 2.5 0 0 1 7 4.5h10A2.5 2.5 0 0 1 19.5 7v10A2.5 2.5 0 0 1 17 19.5H7A2.5 2.5 0 0 1 4.5 17V7Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="m6.5 8 5.5 4 5.5-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

function normalizeDigits(value: string) {
  return value.replace(/\D/g, '');
}

function createCompanyEmail(companyName: string) {
  const alias = companyName
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.+/g, '.');

  return `${alias || 'company'}@samvaad.com`;
}

function getErrorMessage(error: any) {
  if (typeof error?.response?.data === 'string') {
    return error.response.data;
  }

  return error?.response?.data?.message || 'Unable to send license request';
}

export default function License() {
  const user = useAuthStore((state) => state.user);
  const [selectedPlanId, setSelectedPlanId] = useState('team');
  const [billingCycle, setBillingCycle] = useState<'Monthly' | 'Annual'>('Annual');
  const [seatCount, setSeatCount] = useState(25);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [reference, setReference] = useState('');
  const [form, setForm] = useState<CheckoutForm>(() => {
    const displayName = user ? `${user.firstName} ${user.lastName}`.trim() || user.email : '';
    return {
      companyName: '',
      contactName: displayName,
      contactEmail: user?.email || '',
      phone: user?.phoneNumber || '',
      notes: '',
      cardholderName: displayName,
      cardNumber: '',
      expiry: '',
      cvc: '',
    };
  });

  useEffect(() => {
    if (!user) {
      return;
    }

    const displayName = `${user.firstName} ${user.lastName}`.trim() || user.email;
    setForm((current) => ({
      ...current,
      contactName: current.contactName || displayName,
      contactEmail: current.contactEmail || user.email,
      phone: current.phone || user.phoneNumber || '',
      cardholderName: current.cardholderName || displayName,
    }));
  }, [user]);

  const selectedPlan = useMemo(() => plans.find((plan) => plan.id === selectedPlanId) || plans[1], [selectedPlanId]);
  const unitPrice = billingCycle === 'Annual' ? selectedPlan.annualMonthlyPrice : selectedPlan.monthlyPrice;
  const estimatedAmount = unitPrice * seatCount * (billingCycle === 'Annual' ? 12 : 1);
  const cardDigits = normalizeDigits(form.cardNumber);
  const paymentReady = form.cardholderName.trim() && cardDigits.length >= 4 && form.expiry.trim() && form.cvc.trim();
  const companySamvaadEmail = createCompanyEmail(form.companyName);

  const updateForm = (field: keyof CheckoutForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setReference('');

    if (!form.companyName.trim() || !form.contactName.trim() || !form.contactEmail.trim()) {
      setError('Company name, contact name, and contact email are required.');
      return;
    }

    if (!paymentReady) {
      setError('Complete the payment fields to create the request.');
      return;
    }

    setSaving(true);
    try {
      const response = await licenseAPI.requestLicense({
        planName: selectedPlan.name,
        billingCycle,
        seatCount,
        estimatedAmount,
        currency: 'INR',
        companyName: form.companyName,
        companySamvaadEmail,
        contactName: form.contactName,
        contactEmail: form.contactEmail,
        phone: form.phone,
        notes: form.notes,
        paymentLast4: cardDigits.slice(-4),
      });

      setSuccess(response.data?.message || 'License request sent.');
      setReference(response.data?.reference || '');
      setForm((current) => ({
        ...current,
        cardNumber: '',
        expiry: '',
        cvc: '',
      }));
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell active="license" title="License" subtitle="Samvaad">
      <form onSubmit={submit} className="h-full min-h-0 overflow-y-auto bg-slate-100 p-4 text-slate-950 lg:p-6">
        <div className="mx-auto grid max-w-6xl gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="min-w-0 rounded-md border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Samvaad license</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">Purchase a license</h2>
              </div>
              <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1">
                {(['Monthly', 'Annual'] as const).map((cycle) => (
                  <button
                    key={cycle}
                    type="button"
                    onClick={() => setBillingCycle(cycle)}
                    className={`h-9 rounded-md px-4 text-sm font-semibold transition ${
                      billingCycle === cycle
                        ? 'bg-slate-950 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-white hover:text-slate-950'
                    }`}
                  >
                    {cycle}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              {plans.map((plan) => {
                const isSelected = selectedPlan.id === plan.id;
                const price = billingCycle === 'Annual' ? plan.annualMonthlyPrice : plan.monthlyPrice;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`min-h-52 rounded-md border p-4 text-left transition ${
                      isSelected
                        ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-100'
                        : 'border-slate-200 bg-white hover:border-teal-200 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`inline-flex h-10 w-10 items-center justify-center rounded-md ${
                      isSelected ? 'bg-teal-600 text-white' : 'bg-slate-100 text-teal-700'
                    }`}>
                      <ShieldIcon className="h-5 w-5" />
                    </span>
                    <span className="mt-4 block text-lg font-semibold text-slate-950">{plan.name}</span>
                    <span className="mt-2 block text-2xl font-bold text-slate-950">{formatMoney(price)}</span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">per user/month</span>
                    <span className="mt-4 block text-sm text-slate-600">{plan.seatLimit}</span>
                    <span className="mt-1 block text-sm text-slate-600">{plan.storage}</span>
                    <span className="mt-1 block text-sm text-slate-600">{plan.support}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Company name</span>
                <input
                  value={form.companyName}
                  onChange={(event) => updateForm('companyName', event.target.value)}
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Company Samvaad email</span>
                <input
                  value={companySamvaadEmail}
                  readOnly
                  className="mt-2 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 font-semibold text-teal-800 outline-none"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Seats</span>
                <input
                  type="number"
                  min="1"
                  value={seatCount}
                  onChange={(event) => setSeatCount(Math.max(1, Number(event.target.value) || 1))}
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Contact name</span>
                <input
                  value={form.contactName}
                  onChange={(event) => updateForm('contactName', event.target.value)}
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Contact email</span>
                <input
                  type="email"
                  value={form.contactEmail}
                  onChange={(event) => updateForm('contactEmail', event.target.value)}
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Phone</span>
                <input
                  value={form.phone}
                  onChange={(event) => updateForm('phone', event.target.value)}
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                />
              </label>
              <label className="block lg:row-span-2">
                <span className="text-sm font-semibold text-slate-800">Notes</span>
                <textarea
                  value={form.notes}
                  onChange={(event) => updateForm('notes', event.target.value)}
                  rows={5}
                  className="mt-2 h-[132px] w-full resize-none rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                />
              </label>
            </div>
          </section>

          <aside className="min-w-0 rounded-md border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-slate-950 text-white">
                <CardIcon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-lg font-semibold text-slate-950">Checkout</h3>
                <p className="text-sm text-slate-500">Payment simulation</p>
              </div>
            </div>

            <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-500">Plan</span>
                <span className="font-semibold text-slate-950">{selectedPlan.name}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-500">Users</span>
                <span className="font-semibold text-slate-950">{seatCount}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-500">Cycle</span>
                <span className="font-semibold text-slate-950">{billingCycle}</span>
              </div>
              <div className="mt-4 border-t border-slate-200 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estimated total</p>
                <p className="mt-1 text-3xl font-bold text-slate-950">{formatMoney(estimatedAmount)}</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Cardholder name</span>
                <input
                  value={form.cardholderName}
                  onChange={(event) => updateForm('cardholderName', event.target.value)}
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Card number</span>
                <input
                  inputMode="numeric"
                  value={form.cardNumber}
                  onChange={(event) => updateForm('cardNumber', event.target.value.replace(/[^\d ]/g, '').slice(0, 23))}
                  placeholder="4242 4242 4242 4242"
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-800">Expiry</span>
                  <input
                    value={form.expiry}
                    onChange={(event) => updateForm('expiry', event.target.value.slice(0, 7))}
                    placeholder="MM/YY"
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-800">CVC</span>
                  <input
                    inputMode="numeric"
                    value={form.cvc}
                    onChange={(event) => updateForm('cvc', event.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                  />
                </label>
              </div>
            </div>

            {(error || success) && (
              <div className={`mt-5 rounded-md border px-4 py-3 text-sm font-medium ${
                error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
              }`}>
                <div className="flex gap-2">
                  {!error && <MailIcon className="mt-0.5 h-4 w-4 shrink-0" />}
                  <span>
                    {error || success}
                    {reference && <span className="mt-1 block text-xs">Reference: {reference}</span>}
                  </span>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <MailIcon className="h-4 w-4" />
              {saving ? 'Sending request...' : 'Request license'}
            </button>
          </aside>
        </div>
      </form>
    </AppShell>
  );
}

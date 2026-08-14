export interface SubscriptionAccessState {
  status: string | null;
  accessLevel?: string;
  operationalWriteAllowed?: boolean;
  billingAccessAllowed?: boolean;
  planCode?: string | null;
  planVersion?: number | null;
  trialEndsAt?: string | null;
  graceEndsAt?: string | null;
  periodEndsAt?: string | null;
  warnings?: Array<{ code: string; message: string; endsAt?: string }>;
}

export interface SubscriptionBanner {
  tone: 'info' | 'warning' | 'danger';
  title: string;
  message: string;
}

/**
 * Informational only — never used as authorization.
 */
export function buildSubscriptionBanner(
  state: SubscriptionAccessState | null | undefined,
): SubscriptionBanner | null {
  if (state === null || state === undefined || state.status === null) {
    return null;
  }

  if (state.status === 'trial') {
    return {
      tone: 'info',
      title: 'Trial active',
      message: state.trialEndsAt
        ? `Your trial ends on ${formatInstant(state.trialEndsAt)}. Submit billing evidence before expiry.`
        : 'Your organization is on an approved trial.',
    };
  }

  if (state.status === 'grace') {
    return {
      tone: 'warning',
      title: 'Grace period',
      message: state.graceEndsAt
        ? `Operational access continues until ${formatInstant(state.graceEndsAt)}. Submit payment evidence to avoid suspension.`
        : 'Subscription is in grace. Submit payment evidence to continue.',
    };
  }

  if (state.status === 'suspended') {
    return {
      tone: 'danger',
      title: 'Subscription suspended',
      message:
        'Operational writes and imports are blocked. You can still view status, submit billing evidence, and view or export historical reports where your plan allows. Existing data is not deleted.',
    };
  }

  if (state.status === 'active') {
    const warning = state.warnings?.find((item) => item.code === 'period_expiring');
    if (warning) {
      return {
        tone: 'warning',
        title: 'Renewal upcoming',
        message: warning.message,
      };
    }
    return null;
  }

  return {
    tone: 'warning',
    title: 'Subscription notice',
    message: `Current subscription status: ${state.status}.`,
  };
}

function formatInstant(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toISOString().slice(0, 10);
}

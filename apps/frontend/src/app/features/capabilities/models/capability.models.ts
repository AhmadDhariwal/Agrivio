export type CapabilityControlType = 'MODULE' | 'FEATURE' | 'VIEW' | 'FIELD' | 'WIDGET' | 'ACTION';
export type CapabilityValue = Readonly<Record<string, boolean>>;
export type CapabilityRisk = 'NORMAL' | 'RECOMMENDED' | 'CRITICAL';

export interface EffectiveCapabilityControl {
  readonly key: string;
  readonly type: CapabilityControlType;
  readonly value: CapabilityValue;
  readonly reasons: readonly string[];
}

export interface EffectiveCapabilitiesSnapshot {
  readonly organizationId: string;
  readonly version: number;
  readonly controls: readonly EffectiveCapabilityControl[];
}

export interface CapabilityRegistryControl {
  readonly key: string;
  readonly parentKey: string | null;
  readonly moduleKey: string;
  readonly type: CapabilityControlType;
  readonly label: string;
  readonly description: string;
  readonly defaultPolicy: CapabilityValue;
  readonly configurable: CapabilityValue;
  readonly risk: CapabilityRisk;
  readonly platformEnforced?: boolean;
  readonly dependencies?: readonly string[];
  readonly reason?: string;
}

export interface PlatformCapabilityControl extends CapabilityRegistryControl {
  readonly override: CapabilityValue | null;
  readonly configuredValue: CapabilityValue;
  readonly effectiveValue: CapabilityValue;
  readonly reasons: readonly string[];
}

export interface PlatformOrganizationCapabilitySnapshot {
  readonly organization: {
    readonly id: string;
    readonly name: string;
    readonly owner?: { readonly email?: string; readonly displayName?: string } | null;
    readonly ownerEmail?: string;
    readonly subscription?: {
      readonly planCode?: string;
      readonly status?: string;
    } | null;
  };
  readonly policy: {
    readonly version: number;
    readonly updatedBy: string | null;
    readonly updatedAt: string | null;
    readonly operationalAllowed: boolean;
    readonly controls: readonly PlatformCapabilityControl[];
  };
}

export interface CapabilityPolicyChange {
  readonly key: string;
  readonly value: CapabilityValue | null;
}

// Google Cloud's on-demand prices in USD for what a deployment uses, read
// from Google's pricing pages on 2026-11-20. Update them all together, with
// the date, when the prices change, and docs/deploy/gcp.md's cost table too.
//
// They're conservative on purpose: no free tier is subtracted, because its
// exact scope can change, and it's shared with anything else on the billing
// account.
//
// - VM: https://cloud.google.com/products/compute/pricing/general-purpose
//   (E2 shared-core machine types, "Default" column)
// - Disk: https://cloud.google.com/compute/disks-image-pricing ("Standard
//   provisioned space"). Some regions list the first 30 GiB-months free,
//   the free tier, which isn't subtracted: the price above it is used.
// - IPv4 address and egress: https://cloud.google.com/vpc/network-pricing
//   ("Static and ephemeral IP addresses in use on standard VM instances",
//   and "Standard Tier pricing", whose first 200 GiB a month per account are
//   free, not subtracted either)

interface RegionPrices {
  /** An e2-micro VM, per hour */
  vmPerHour: number;
  /** A standard persistent disk (pd-standard), per GiB and hour */
  diskPerGibHour: number;
}

export interface Prices {
  /** The date these prices were read */
  checked: string;
  /** An external IPv4 address in use by a standard VM, per hour */
  ipv4PerHour: number;
  /** Standard Tier internet egress, per GiB, from any of the regions below */
  egressPerGib: number;
  /** Only these regions can be deployed to. Add a region's prices to use it. */
  regions: Record<string, RegionPrices>;
}

export const prices: Prices = {
  checked: "2026-11-20",
  ipv4PerHour: 0.005,
  egressPerGib: 0.085,
  regions: {
    // Finland, the default
    "europe-north1": { vmPerHour: 0.009222195, diskPerGibHour: 0.000060274 },
    // Belgium
    "europe-west1": { vmPerHour: 0.009214433, diskPerGibHour: 0.000054795 },
    // The free tier's regions, in the US
    "us-central1": { vmPerHour: 0.008376428, diskPerGibHour: 0.000054795 },
    "us-east1": { vmPerHour: 0.008376428, diskPerGibHour: 0.000054795 },
    "us-west1": { vmPerHour: 0.008376428, diskPerGibHour: 0.000054795 },
  },
};

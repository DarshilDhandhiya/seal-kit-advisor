/**
 * Deterministic fitment rules engine.
 *
 * Rule precedence (first match wins):
 *   1. Machine serial must exist and be active           -> else human_review_unknown_serial
 *   2. Assembly must be provided                         -> else ask_assembly
 *   3. Assembly code must exist                          -> else human_review_unknown_assembly
 *   4. Only ACTIVE + VERIFIED fitments for the EXACT serial + EXACT assembly are considered
 *      (never "nearest model", never other serials of the same model)
 *   5. Only ACTIVE kits are considered; none left        -> human_review_no_fitment
 *   6. More than one distinct kit                        -> human_review_multiple_kits (ask part no. / staff)
 *   7. Exactly one kit with stock <= 0                   -> out_of_stock (kit shown, no availability promise)
 *   8. Exactly one kit with stock > 0                    -> recommend
 *
 * No generative model and no OCR output participates here: the input is a customer-confirmed serial.
 */
export interface MachineRec {
  serial: string;
  model: string;
  family: string;
  variant: string;
  year: number;
  status: string;
}
export interface AssemblyRec {
  code: string;
  label: string;
  labelHi?: string;
  imageUrl?: string;
}
export interface KitRec {
  sku: string;
  name: string;
  assemblyCode: string;
  demoPriceINR: number;
  stock: number;
  imageUrl?: string;
  description?: string;
  active: boolean;
}
export interface FitmentRec {
  machineSerial: string;
  assemblyCode: string;
  kitSku: string;
  evidenceSource?: string;
  verified: boolean;
  active: boolean;
}

export interface CatalogRepo {
  findMachine(serial: string): Promise<MachineRec | null>;
  findAssembly(code: string): Promise<AssemblyRec | null>;
  findFitments(serial: string, assemblyCode: string): Promise<FitmentRec[]>;
  findKits(skus: string[]): Promise<KitRec[]>;
}

export type FitmentOutcome =
  | 'recommend'
  | 'out_of_stock'
  | 'ask_assembly'
  | 'human_review_unknown_serial'
  | 'human_review_unknown_assembly'
  | 'human_review_no_fitment'
  | 'human_review_multiple_kits'
  | 'human_review_inactive_kit';

export interface FitmentResult {
  outcome: FitmentOutcome;
  machine?: MachineRec;
  assembly?: AssemblyRec;
  kit?: KitRec;
  fitment?: FitmentRec;
  candidates?: KitRec[];
}

export async function resolveFitment(
  repo: CatalogRepo,
  serial: string | null | undefined,
  assemblyCode: string | null | undefined,
): Promise<FitmentResult> {
  const sn = (serial ?? '').trim().toUpperCase();
  const machine = sn ? await repo.findMachine(sn) : null;
  if (!machine || machine.status !== 'active') return { outcome: 'human_review_unknown_serial' };

  const code = (assemblyCode ?? '').trim().toUpperCase();
  if (!code) return { outcome: 'ask_assembly', machine };

  const assembly = await repo.findAssembly(code);
  if (!assembly) return { outcome: 'human_review_unknown_assembly', machine };

  const all = await repo.findFitments(machine.serial, assembly.code);
  const usable = all.filter(
    (f) =>
      f.machineSerial.toUpperCase() === machine.serial.toUpperCase() &&
      f.assemblyCode.toUpperCase() === assembly.code.toUpperCase() &&
      f.active &&
      f.verified,
  );
  if (usable.length === 0) return { outcome: 'human_review_no_fitment', machine, assembly };

  const kits = await repo.findKits([...new Set(usable.map((f) => f.kitSku.toUpperCase()))]);
  const activeKits = kits
    .filter((k) => k.active && k.assemblyCode.toUpperCase() === assembly.code.toUpperCase())
    .sort((a, b) => a.sku.localeCompare(b.sku));
  if (activeKits.length === 0) {
    return { outcome: 'human_review_inactive_kit', machine, assembly };
  }
  if (activeKits.length > 1) {
    return { outcome: 'human_review_multiple_kits', machine, assembly, candidates: activeKits };
  }
  const kit = activeKits[0];
  const fitment = usable.find((f) => f.kitSku.toUpperCase() === kit.sku.toUpperCase());
  return { outcome: kit.stock > 0 ? 'recommend' : 'out_of_stock', machine, assembly, kit, fitment };
}

/** Mongo-backed repository. */
import { Machine, Assembly, Kit, Fitment } from '../models/index.js';

export const mongoCatalogRepo: CatalogRepo = {
  async findMachine(serial) {
    return (await Machine.findOne({ serial }).lean()) as MachineRec | null;
  },
  async findAssembly(code) {
    return (await Assembly.findOne({ code }).lean()) as AssemblyRec | null;
  },
  async findFitments(serial, assemblyCode) {
    return (await Fitment.find({ machineSerial: serial, assemblyCode }).lean()) as unknown as FitmentRec[];
  },
  async findKits(skus) {
    return (await Kit.find({ sku: { $in: skus } }).lean()) as unknown as KitRec[];
  },
};

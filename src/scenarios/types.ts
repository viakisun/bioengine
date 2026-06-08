// S1.d (RFP §15) — Scenario schema (Zod).
//
// docs/proposal/04-scenario-catalog.md §2 파일 포맷 + Composer dial 25종 (§3).
// jsonc 입력 → 본 Zod schema로 validate → ScenarioSpec 으로 사용.
//
// S1 mvp: Crop·Env·Robot·Task·Verify 최소 필드만 강제.
// S2에서 Composer dial 25종 모두 강제.

import { z } from 'zod';

const Vec3 = z.tuple([z.number(), z.number(), z.number()]);

const CropSchema = z.object({
  day: z.number().int().min(0).max(120),
  seed: z.string().regex(/^0x[0-9a-fA-F]+$/),
  cultivar: z.string().default('tomimaru'),
  perturbation: z
    .object({
      leafDensityScale: z.number().min(0.5).max(1.5).optional(),
      internodeScale: z.number().min(0.7).max(1.3).optional(),
      trussTimingOffset: z.number().min(-10).max(10).optional(),
      fruitSetRate: z.number().min(0.5).max(1.0).optional(),
    })
    .optional(),
  // §19 phenotyping — 적엽(defoliation) 옵션. UI slider 노출 + max clamp.
  cultivation: z
    .object({
      deleafHeightCm: z.number().min(0).max(150).optional(),
      deleafMaxCm: z.number().min(0).max(150).optional(),
      deleafEnabled: z.boolean().optional(),
    })
    .optional(),
});

const EnvSchema = z.object({
  manualHour: z.number().min(0).max(24),
  lightingPreset: z.enum(['default', 'overcast', 'golden', 'noon-bright', 'grow-light']).default('default'),
  wind: z
    .object({
      strength: z.number().min(0).max(1),
      direction: Vec3,
    })
    .optional(),
  fogDensity: z.number().min(0).max(0.1).optional(),
});

const RobotSchema = z
  .object({
    model: z.string(),
    profile: z.enum(['agv-arm', 'phenotyping']).optional(),
    startPose: z
      .object({
        rail: z.string().optional(),
        x: z.number().optional(),
      })
      .or(
        z.object({
          x: z.number(),
          y: z.number(),
          z: z.number(),
        }),
      )
      .optional(),
    endEffector: z.enum(['thinning-cutter', 'gripper', 'none']).default('none'),
    camera: z
      .object({
        head: z
          .object({
            lens: z.number().optional(),
            mountHeight: z.number().optional(),
            pitch: z.number().optional(),
            yaw: z.number().optional(),
          })
          .optional(),
        endEffector: z
          .object({
            lens: z.number().optional(),
            mountHeight: z.number().optional(),
            pitch: z.number().optional(),
            yaw: z.number().optional(),
          })
          .optional(),
      })
      .optional(),
  })
  .optional();

const TaskSchema = z.object({
  type: z.enum([
    'drive-traverse',
    'thinning-decision',
    'pruning-sucker',
    'pruning-apex',
    'spray-survey',
    'recognition-capture',
    'noop',
  ]),
  speedMps: z.number().min(0).max(1).default(0),
  decisionTriggers: z.array(z.string()).optional(),
  targets: z.string().optional(),
  rule: z.string().optional(),
  labelClasses: z.array(z.string()).optional(),
});

const VerifySchema = z.object({
  successCriteria: z.array(
    z.object({
      metric: z.string(),
      min: z.number().optional(),
      max: z.number().optional(),
      note: z.string().optional(),
    }),
  ),
});

const WorldSchema = z.object({
  greenhouseConfig: z.string().default('default-24x34-13beds'),
  activeBeds: z.array(z.number().int()).optional(),
  plantPlacement: z.string().optional(),
  // §19 phenotyping — 통로 기준 좌·우 베드 분배 + hole stride.
  bedLayout: z
    .object({
      leftCols: z.number().int().min(0).max(10),
      rightCols: z.number().int().min(0).max(10),
      stride: z.number().int().min(1).max(10),
    })
    .optional(),
});

const MetaSchema = z
  .object({
    parentId: z.string().nullable().optional(),
    createdBy: z.string().optional(),
    createdAt: z.string().optional(),
    description: z.string().optional(),
  })
  .optional();

export const ScenarioSchema = z.object({
  // S8 hotfix — `D15`·`LAI` 같이 대문자 약어(생육 일자·LAI 등) 허용.
  // kebab-case 의도는 유지 (구분자는 '-', 공백·언더스코어 금지).
  id: z.string().regex(/^[a-zA-Z0-9-]+$/),
  version: z.string(),
  domain: z.enum(['autonomous-driving', 'thinning', 'pruning', 'spray', 'recognition', 'phenotyping']),
  consumableBy: z.array(z.enum(['Workbench', 'Foundry', 'Twin'])).min(1),
  world: WorldSchema,
  crop: CropSchema,
  env: EnvSchema,
  robot: RobotSchema,
  task: TaskSchema,
  verify: VerifySchema,
  greenhouse: z
    .object({
      aisleWidthScale: z.number().min(0.8).max(1.2).optional(),
    })
    .optional(),
  foundry: z
    .object({
      matrix: z.record(z.string(), z.array(z.union([z.string(), z.number()]))).optional(),
      seeds: z.number().int().positive().optional(),
      outputs: z.array(z.string()).optional(),
      framesPerCondition: z.number().int().positive().optional(),
      expectedFrames: z.number().int().positive().optional(),
    })
    .optional(),
  meta: MetaSchema,
});

export type ScenarioSpec = z.infer<typeof ScenarioSchema>;
export type ScenarioDomain = ScenarioSpec['domain'];
export type ScenarioMode = ScenarioSpec['consumableBy'][number];

/** PASS/FAIL summary for catalog UI (Picker badge). */
export interface ScenarioStatus {
  state: 'pass' | 'partial' | 'fail' | 'untested';
}

/** Skeletons and options for the illustrated batter. */

export type P = readonly [number, number];

interface Pose {
  shoulderBack: P;
  shoulderFront: P;
  hipBack: P;
  hipFront: P;
  kneeBack: P;
  ankleBack: P;
  kneeFront: P;
  ankleFront: P;
  elbowBack: P;
  elbowFront: P;
  hands: P;
  /** Direction of the bat from the hands, in degrees: 0 points right, 90 straight up. */
  bat: number;
  head?: { dx?: number; dy?: number; tilt?: number };
  /** Degrees the front foot is lifted. */
  frontFootLift?: number;
}

/** All face right; mirroring is applied afterwards. */
export const POSES: readonly Pose[] = [
  // Classic stance
  { shoulderBack: [160, 186], shoulderFront: [270, 182], hipBack: [165, 326], hipFront: [268, 322], kneeBack: [114, 477], ankleBack: [108, 606], kneeFront: [320, 472], ankleFront: [354, 606], elbowBack: [88, 226], elbowFront: [216, 232], hands: [136, 180], bat: 121 },
  // High hands, bat nearly upright
  { shoulderBack: [164, 186], shoulderFront: [272, 184], hipBack: [170, 326], hipFront: [270, 322], kneeBack: [128, 476], ankleBack: [118, 606], kneeFront: [306, 474], ankleFront: [330, 606], elbowBack: [86, 168], elbowFront: [222, 216], hands: [148, 122], bat: 102 },
  // Deep crouch with a wide base
  { shoulderBack: [150, 226], shoulderFront: [262, 216], hipBack: [148, 362], hipFront: [254, 358], kneeBack: [84, 480], ankleBack: [70, 606], kneeFront: [336, 480], ankleFront: [392, 606], elbowBack: [76, 272], elbowFront: [204, 278], hands: [128, 226], bat: 140, head: { dx: 4, dy: 2, tilt: 6 } },
  // Leg kick: weight back, front foot in the air
  { shoulderBack: [152, 182], shoulderFront: [260, 178], hipBack: [160, 322], hipFront: [258, 320], kneeBack: [154, 468], ankleBack: [132, 606], kneeFront: [344, 388], ankleFront: [338, 516], elbowBack: [80, 228], elbowFront: [208, 238], hands: [126, 186], bat: 118, head: { dx: -6, tilt: -3 }, frontFootLift: 24 },
  // Mid-swing, hands driving through and the bat level
  { shoulderBack: [120, 204], shoulderFront: [222, 190], hipBack: [120, 336], hipFront: [214, 328], kneeBack: [66, 474], ankleBack: [34, 606], kneeFront: [276, 462], ankleFront: [310, 606], elbowBack: [190, 276], elbowFront: [256, 232], hands: [280, 262], bat: 8, head: { dx: 2, dy: 2, tilt: 8 } },
  // Waiting, bat resting on the shoulder
  { shoulderBack: [164, 190], shoulderFront: [266, 186], hipBack: [172, 330], hipFront: [260, 326], kneeBack: [158, 478], ankleBack: [146, 606], kneeFront: [274, 476], ankleFront: [294, 606], elbowBack: [122, 278], elbowFront: [254, 282], hands: [188, 252], bat: 141 },
];

export interface FigureVariant {
  pose: number;
  bat: number;
  chain?: "gold" | "silver" | null;
  elbowGuard?: boolean;
  shinGuard?: boolean;
  wristband?: boolean;
  longPants?: boolean;
  longSleeves?: boolean;
}

export const metersToSceneUnits = 1;
export const representation = 'extant-survey';

export const FLOOR_STATUE_CONFIG = [
  {
    floor: 1,
    groupName: 'statues-floor-1',
    innerR: 7.31,
    name: '第一层',
    items: [
      {
        id: 'floor1-main-buddha',
        type: 'buddha',
        name: '释迦牟尼佛',
        direction: 0,
        dims: { topHeight: 10.32, totalHeight: 10.32, figureHeight: 8.478, baseWidth: 6.955, figureWidth: 5.537, headHeight: 2.625 },
        evidenceLevel: 'measured',
        attitude: '结跏趺坐',
        x: 0, z: 0,
      },
    ],
    murals: {
      count: 6,
      averageTopHeight: 7.28,
      colors: ['#a66b57', '#d8b16b', '#6a7a63', '#dd9b4f', '#a84c39'],
    },
  },
  {
    floor: 2,
    groupName: 'statues-floor-2',
    innerR: 6.93,
    name: '第二层',
    items: [
      { id: 'floor2-main-buddha', type: 'buddha', name: '二层主尊佛', dims: { topHeight: 4.420, totalHeight: 4.052, figureHeight: 3.126, baseWidth: 2.667, figureWidth: 2.051, headHeight: 0.876 }, direction: 0, evidenceLevel: 'measured', x: 0, z: 0 },
      { id: 'floor2-northwest-attendant', type: 'bodhisattva', name: '西北胁侍菩萨', dims: { topHeight: 3.260, totalHeight: 2.892, figureHeight: 2.726, baseWidth: 0.856 }, direction: Math.PI * 0.75, evidenceLevel: 'probable-identification', x: -1.15, z: -1.15 },
      { id: 'floor2-northeast-attendant', type: 'bodhisattva', name: '东北胁侍菩萨', dims: { topHeight: 3.348, totalHeight: 2.980, figureHeight: 2.809, baseWidth: 0.810 }, direction: Math.PI * 1.25, evidenceLevel: 'probable-identification', x: 1.15, z: -1.15 },
      { id: 'floor2-manjushri', type: 'manjushri', name: '文殊菩萨', dims: { topHeight: 3.007, totalHeight: 2.639, figureHeight: 1.838, baseWidth: 1.595 }, direction: Math.PI * 0.2, evidenceLevel: 'probable-identification', x: -1.25, z: 1.15 },
      { id: 'floor2-samantabhadra', type: 'samantabhadra', name: '普贤菩萨', dims: { topHeight: 2.985, totalHeight: 2.617, figureHeight: 1.802, baseWidth: 1.607 }, direction: Math.PI * 1.8, evidenceLevel: 'probable-identification', x: 1.25, z: 1.15 },
    ],
  },
  {
    floor: 3,
    groupName: 'statues-floor-3',
    innerR: 6.76,
    name: '第三层',
    items: [
      { id: 'floor3-east-buddha', type: 'buddha', name: '阿閦佛', direction: 0, dims: { topHeight: 3.348, totalHeight: 2.781, figureHeight: 1.980, baseWidth: 1.789 }, evidenceLevel: 'measured', x: 1.7, z: 0 },
      { id: 'floor3-south-buddha', type: 'buddha', name: '宝生佛', direction: Math.PI / 2, dims: { topHeight: 3.313, totalHeight: 2.746, figureHeight: 1.969, baseWidth: 1.699 }, evidenceLevel: 'measured', x: 0, z: 1.7 },
      { id: 'floor3-west-buddha', type: 'buddha', name: '阿弥陀佛', direction: Math.PI, dims: { topHeight: 3.279, totalHeight: 2.712, figureHeight: 1.945, baseWidth: 1.842 }, evidenceLevel: 'measured', x: -1.7, z: 0 },
      { id: 'floor3-north-buddha', type: 'buddha', name: '不空成就佛', direction: -Math.PI / 2, dims: { topHeight: 3.245, totalHeight: 2.678, figureHeight: 1.954, baseWidth: 1.840 }, evidenceLevel: 'measured', x: 0, z: -1.7 },
    ],
  },
  {
    floor: 4,
    groupName: 'statues-floor-4',
    innerR: 6.65,
    name: '第四层',
    items: [
      { id: 'floor4-main-buddha', type: 'buddha', name: '四层主尊佛', dims: { topHeight: 4.710, totalHeight: 4.274, figureHeight: 3.235, baseWidth: 2.798, figureWidth: 2.115, headHeight: 0.935 }, direction: 0, evidenceLevel: 'probable-identification', x: 0, z: 0 },
      { id: 'floor4-northwest-disciple', type: 'disciple', name: '西北弟子', dims: { topHeight: 2.754, totalHeight: 2.318, figureHeight: 2.136 }, direction: Math.PI * 0.75, evidenceLevel: 'later-restoration', x: -1.5, z: -1.0 },
      { id: 'floor4-northeast-disciple', type: 'disciple', name: '东北弟子', dims: { topHeight: 2.738, totalHeight: 2.302, figureHeight: 2.120 }, direction: Math.PI * 1.25, evidenceLevel: 'later-restoration', x: 1.5, z: -1.0 },
      { id: 'floor4-manjushri', type: 'manjushri', name: '文殊菩萨', dims: { topHeight: 3.248, totalHeight: 2.812, figureHeight: 1.435 }, direction: Math.PI * 0.1, evidenceLevel: 'later-restoration', x: -1.4, z: 1.25 },
      { id: 'floor4-samantabhadra', type: 'samantabhadra', name: '普贤菩萨', dims: { topHeight: 3.278, totalHeight: 2.842, figureHeight: 1.438 }, direction: Math.PI * 1.9, evidenceLevel: 'later-restoration', x: 1.4, z: 1.25 },
      { id: 'floor4-lion-attendant', type: 'attendant', name: '牵狮侍从', dims: { topHeight: 1.499, totalHeight: 1.063 }, direction: Math.PI * 0.35, evidenceLevel: 'later-restoration', x: -2.3, z: 0.55 },
      { id: 'floor4-elephant-attendant', type: 'attendant', name: '牵象侍从', dims: { topHeight: 1.522, totalHeight: 1.086 }, direction: Math.PI * 1.65, evidenceLevel: 'later-restoration', x: 2.3, z: 0.55 },
    ],
  },
  {
    floor: 5,
    groupName: 'statues-floor-5',
    innerR: 6.30,
    name: '第五层',
    items: [
      { id: 'floor5-vairocana', type: 'buddha', name: '毗卢遮那佛', dims: { topHeight: 3.970, totalHeight: 3.414, figureHeight: 2.398, baseWidth: 2.242, figureWidth: 1.590, headHeight: 0.784 }, direction: 0, evidenceLevel: 'measured', x: 0, z: 0 },
      { id: 'floor5-south', type: 'bodhisattva', name: '除盖障菩萨', dims: { topHeight: 2.508, totalHeight: 1.952, figureHeight: 1.305, baseWidth: 1.162 }, direction: Math.PI / 2, evidenceLevel: 'measured', x: 0, z: 1.7 },
      { id: 'floor5-southwest', type: 'bodhisattva', name: '地藏菩萨', dims: { topHeight: 2.514, totalHeight: 1.958, figureHeight: 1.294, baseWidth: 1.188 }, direction: Math.PI * 0.75, evidenceLevel: 'measured', x: -1.2, z: 1.2 },
      { id: 'floor5-west', type: 'bodhisattva', name: '观世音菩萨', dims: { topHeight: 2.588, totalHeight: 2.032, figureHeight: 1.379, baseWidth: 1.173 }, direction: Math.PI, evidenceLevel: 'measured', x: -1.7, z: 0 },
      { id: 'floor5-northwest', type: 'bodhisattva', name: '弥勒菩萨', dims: { topHeight: 2.574, totalHeight: 2.018, figureHeight: 1.372, baseWidth: 1.200 }, direction: Math.PI * 1.25, evidenceLevel: 'measured', x: -1.2, z: -1.2 },
      { id: 'floor5-north', type: 'bodhisattva', name: '虚空藏菩萨', dims: { topHeight: 2.602, totalHeight: 2.046, figureHeight: 1.412, baseWidth: 1.180 }, direction: -Math.PI / 2, evidenceLevel: 'measured', x: 0, z: -1.7 },
      { id: 'floor5-northeast', type: 'bodhisattva', name: '普贤菩萨', dims: { topHeight: 2.563, totalHeight: 2.007, figureHeight: 1.372, baseWidth: 1.193 }, direction: Math.PI * 1.75, evidenceLevel: 'measured', x: 1.2, z: -1.2 },
      { id: 'floor5-east', type: 'bodhisattva', name: '金刚手菩萨', dims: { topHeight: 2.557, totalHeight: 2.001, figureHeight: 1.348, baseWidth: 1.194 }, direction: 0, evidenceLevel: 'measured', x: 1.7, z: 0 },
      { id: 'floor5-southeast', type: 'bodhisattva', name: '文殊菩萨', dims: { topHeight: 2.607, totalHeight: 2.051, figureHeight: 1.371, baseWidth: 1.162 }, direction: Math.PI * 0.25, evidenceLevel: 'measured', x: 1.2, z: 1.2 },
    ],
  },
];

export const FLOOR_TOTALS = {
  1: 1,
  2: 5,
  3: 4,
  4: 7,
  5: 9,
};

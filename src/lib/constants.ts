import type { ContestCategory } from '../types'

export const CONTEST_TYPE_ORDER: ContestCategory[] = [
  'freshman',
  'school',
  'icpc_regional',
  'ccpc_regional',
  'provincial',
  'lanqiao',
  'ladder',
  'other',
]

export const CONTEST_TYPE_LABELS: Record<ContestCategory, string> = {
  freshman: '新生赛',
  school: '校赛',
  icpc_regional: 'ICPC 区域赛',
  ccpc_regional: 'CCPC 区域赛',
  provincial: '省赛',
  lanqiao: '蓝桥杯',
  ladder: '天梯赛',
  other: '其他',
}

export const CONTEST_TYPE_DESCRIPTIONS: Record<ContestCategory, string> = {
  freshman: '面向新入队成员或低年级的训练/选拔比赛。',
  school: '校内 ACM / 程序设计竞赛。',
  icpc_regional: 'ICPC Regional，按赛站记录。',
  ccpc_regional: 'CCPC Regional，按赛站记录。',
  provincial: '省级程序设计竞赛或省选相关赛事。',
  lanqiao: '蓝桥杯省赛/国赛成绩。',
  ladder: '团体程序设计天梯赛。',
  other: '暂时无法归类的竞赛。',
}

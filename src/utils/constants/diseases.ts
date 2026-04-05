export const DISEASE_MATRIX: { 
  condition: (temp: number, humidity: number) => boolean
  crops: string[]
  name: string
  advice: string
  severity: 'warn' | 'danger'
}[] = [
  {
    name: '🍄 Фитофтора',
    condition: (t, h) => t >= 15 && t <= 25 && h >= 75,
    crops: ['tomato', 'potato'],
    advice: 'Обработайте медным купоросом или фунгицидом. Избегайте полива сверху.',
    severity: 'danger',
  },
  {
    name: '🕷️ Паутинный клещ',
    condition: (t, h) => t >= 25 && h < 50,
    crops: ['cucumber', 'pepper', 'eggplant', 'tomato'],
    advice: 'Опрыскайте акарицидом или мыльным раствором. Повысьте влажность.',
    severity: 'warn',
  },
  {
    name: '🌫️ Мучнистая роса',
    condition: (t, h) => t >= 18 && t <= 26 && h >= 60 && h <= 80,
    crops: ['cucumber', 'zucchini', 'pumpkin', 'strawberry'],
    advice: 'Обработайте содовым раствором или фунгицидом. Улучшите вентиляцию.',
    severity: 'warn',
  },
  {
    name: '🦟 Белокрылка',
    condition: (t, h) => t >= 22 && h >= 70,
    crops: ['tomato', 'pepper', 'eggplant', 'cucumber'],
    advice: 'Используйте жёлтые клеевые ловушки, обработайте инсектицидом.',
    severity: 'warn',
  },
  {
    name: '🐛 Капустная совка',
    condition: (t, h) => t >= 18 && t <= 28 && h >= 65,
    crops: ['cabbage'],
    advice: 'Осмотрите листья снизу, удалите яйца вручную. Обработайте Лепидоцидом.',
    severity: 'warn',
  },
  {
    name: '❄️ Риск заморозка',
    condition: (t, humidity) => t <= 3 && humidity >= 0,
    crops: ['tomato', 'cucumber', 'pepper', 'eggplant', 'zucchini', 'pumpkin', 'basil'],
    advice: 'Укройте растения агроволокном или плёнкой на ночь.',
    severity: 'danger',
  },
]

export type DiagnosisSymptomPart = 'leaf' | 'stem' | 'fruit' | 'root' | 'whole'
export type DiagnosisPrimarySymptom = 'spots' | 'yellowing' | 'coating' | 'curling' | 'wilting' | 'holes' | 'rot' | 'pests' | 'poor_growth'
export type DiagnosisSymptomZone = 'lower' | 'upper' | 'edges' | 'isolated' | 'everywhere' | 'base' | 'fruits'
export type DiagnosisCondition = 'after_rain' | 'greenhouse' | 'hot_dry' | 'soil_wet' | 'soil_dry' | 'cold_nights' | 'after_feeding' | 'thickened'

export interface DiagnosisOption<T extends string> {
  id: T
  label: string
}

export interface SymptomDiagnosisInput {
  part: DiagnosisSymptomPart | ''
  symptom: DiagnosisPrimarySymptom | ''
  zone: DiagnosisSymptomZone | ''
  conditions: DiagnosisCondition[]
}

export interface SymptomDiagnosisFinding {
  id: string
  title: string
  summary: string
  checks: string[]
  actions: string[]
  urgency: 'low' | 'medium' | 'high'
}

type CropDiagnosisGroup =
  | 'solanaceae'
  | 'cucurbits'
  | 'brassicas'
  | 'alliums'
  | 'roots'
  | 'leafy'
  | 'berries'
  | 'herbs'
  | 'legumes'
  | 'corn'

const CROP_DIAGNOSIS_GROUPS: Record<string, CropDiagnosisGroup> = {
  tomato: 'solanaceae',
  pepper: 'solanaceae',
  eggplant: 'solanaceae',
  potato: 'solanaceae',
  cucumber: 'cucurbits',
  zucchini: 'cucurbits',
  pumpkin: 'cucurbits',
  cabbage: 'brassicas',
  radish: 'brassicas',
  turnip: 'brassicas',
  daikon: 'brassicas',
  arugula: 'brassicas',
  onion: 'alliums',
  garlic: 'alliums',
  carrot: 'roots',
  beet: 'roots',
  parsnip: 'roots',
  celery_root: 'roots',
  lettuce: 'leafy',
  spinach: 'leafy',
  sorrel: 'leafy',
  strawberry: 'berries',
  raspberry: 'berries',
  currant: 'berries',
  gooseberry: 'berries',
  blackberry: 'berries',
  blueberry: 'berries',
  honeysuckle: 'berries',
  seabuckthorn: 'berries',
  dill: 'herbs',
  parsley: 'herbs',
  basil: 'herbs',
  mint: 'herbs',
  melissa: 'herbs',
  tarragon: 'herbs',
  pea: 'legumes',
  corn: 'corn',
}

const WARM_LOVING_CROPS = new Set([
  'tomato', 'pepper', 'eggplant', 'cucumber', 'zucchini', 'pumpkin', 'basil', 'corn',
])

export const DIAGNOSIS_PART_OPTIONS: Array<DiagnosisOption<DiagnosisSymptomPart>> = [
  { id: 'leaf', label: 'Листья' },
  { id: 'stem', label: 'Стебель или побег' },
  { id: 'fruit', label: 'Плод или ягода' },
  { id: 'root', label: 'Корень или шейка' },
  { id: 'whole', label: 'Всё растение' },
]

export const DIAGNOSIS_PRIMARY_OPTIONS: Array<DiagnosisOption<DiagnosisPrimarySymptom>> = [
  { id: 'spots', label: 'Пятна' },
  { id: 'yellowing', label: 'Желтеет' },
  { id: 'coating', label: 'Налёт' },
  { id: 'curling', label: 'Скручивается' },
  { id: 'wilting', label: 'Вянет' },
  { id: 'holes', label: 'Дырки или объедено' },
  { id: 'rot', label: 'Гниёт' },
  { id: 'pests', label: 'Есть насекомые' },
  { id: 'poor_growth', label: 'Плохо растёт' },
]

export const DIAGNOSIS_ZONE_OPTIONS: Array<DiagnosisOption<DiagnosisSymptomZone>> = [
  { id: 'lower', label: 'Снизу' },
  { id: 'upper', label: 'Сверху или на молодом' },
  { id: 'edges', label: 'По краям' },
  { id: 'isolated', label: 'Отдельными очагами' },
  { id: 'everywhere', label: 'Почти везде' },
  { id: 'base', label: 'У основания' },
  { id: 'fruits', label: 'На плодах' },
]

export const DIAGNOSIS_CONDITION_OPTIONS: Array<DiagnosisOption<DiagnosisCondition>> = [
  { id: 'after_rain', label: 'После дождей' },
  { id: 'greenhouse', label: 'В теплице' },
  { id: 'hot_dry', label: 'Жарко и сухо' },
  { id: 'soil_wet', label: 'Почва сырая' },
  { id: 'soil_dry', label: 'Почва сухая' },
  { id: 'cold_nights', label: 'Были холодные ночи' },
  { id: 'after_feeding', label: 'После подкормки' },
  { id: 'thickened', label: 'Посадки загущены' },
]

function hasCondition(input: SymptomDiagnosisInput, condition: DiagnosisCondition) {
  return input.conditions.includes(condition)
}

function pushFinding(
  findings: Array<SymptomDiagnosisFinding & { score: number }>,
  finding: SymptomDiagnosisFinding & { score: number },
) {
  if (finding.score >= 3) findings.push(finding)
}

export function diagnoseCropSymptoms(cropId: string, input: SymptomDiagnosisInput): SymptomDiagnosisFinding[] {
  if (!cropId || !input.symptom) return []

  const group = CROP_DIAGNOSIS_GROUPS[cropId]
  const findings: Array<SymptomDiagnosisFinding & { score: number }> = []

  if (input.symptom === 'spots' && (input.part === 'leaf' || input.part === 'whole' || !input.part)) {
    let score = 4
    if (hasCondition(input, 'after_rain')) score += 2
    if (hasCondition(input, 'greenhouse')) score += 1
    if (hasCondition(input, 'thickened')) score += 1
    if (group === 'solanaceae' || group === 'cucurbits' || group === 'berries') score += 1
    if (group === 'solanaceae' && hasCondition(input, 'cold_nights')) score += 1
    pushFinding(findings, {
      id: 'fungal_leaf_spot',
      score,
      title: group === 'solanaceae' ? 'Похоже на грибковую пятнистость или фитопроблему' : 'Похоже на грибковую пятнистость',
      summary: group === 'solanaceae'
        ? 'Для паслёновых пятна после сырой погоды и прохладных ночей часто идут по сценарию фитофторной или альтернариозной проблемы.'
        : 'Пятна на листьях после сырой погоды чаще всего говорят о грибковой или бактериальной листовой проблеме.',
      checks: [
        'Посмотрите, увеличиваются ли пятна за 1-2 дня и есть ли тёмная кайма.',
        'Проверьте нижнюю сторону листа и соседние растения рядом.',
        'Оцените, не остаются ли листья мокрыми надолго после полива или дождя.',
      ],
      actions: [
        'Уберите самые поражённые листья и не оставляйте их на грядке.',
        'На пару дней исключите полив по листу и дайте посадкам больше проветривания.',
        'Если пятна быстро идут вверх, готовьте мягкую фунгицидную обработку по инструкции.',
      ],
      urgency: hasCondition(input, 'after_rain') && group === 'solanaceae' ? 'high' : 'medium',
    })
  }

  if (input.symptom === 'coating' && (input.part === 'leaf' || input.part === 'whole' || !input.part)) {
    let score = 4
    if (group === 'cucurbits' || group === 'berries' || group === 'herbs') score += 2
    if (hasCondition(input, 'greenhouse') || hasCondition(input, 'thickened')) score += 1
    if (hasCondition(input, 'hot_dry') || hasCondition(input, 'after_rain')) score += 1
    pushFinding(findings, {
      id: 'powdery_mildew_like',
      score,
      title: 'Похоже на грибковый налёт',
      summary: 'Белёсый или сероватый налёт на листьях у многих культур начинается как мучнистая роса или близкая к ней грибковая проблема.',
      checks: [
        'Проверьте, стирается ли часть налёта пальцем или он как будто врастает в ткань.',
        'Посмотрите, есть ли похожие участки на соседних листьях и на молодых побегах.',
        'Оцените, хватает ли проветривания и не загущена ли посадка.',
      ],
      actions: [
        'Срежьте самые поражённые листья, чтобы снизить очаг.',
        'На время сократите загущение и улучшите проветривание.',
        'Если налёт идёт быстро, готовьте обработку от грибковых болезней по инструкции.',
      ],
      urgency: 'medium',
    })
  }

  if (input.symptom === 'holes') {
    let score = 5
    if (group === 'brassicas' || group === 'leafy' || group === 'berries') score += 1
    if (hasCondition(input, 'after_rain')) score += 1
    pushFinding(findings, {
      id: 'chewing_pests',
      score,
      title: 'Похоже на грызущих вредителей',
      summary: 'Дырки, объеденные края и неровные надкусы чаще всего дают гусеницы, слизни, блошки или жуки.',
      checks: [
        'Осмотрите листья снизу, а также растение рано утром или вечером.',
        'Проверьте, нет ли мелких чёрных точек, слизистых следов или кладок яиц.',
        'Посмотрите, страдают ли сильнее молодые и нежные листья.',
      ],
      actions: [
        'Соберите заметных вредителей вручную, если очаг небольшой.',
        'Уберите лишние укрытия для слизней и проредите загущение.',
        'Если объедание нарастает, переходите к биопрепарату или точечной обработке по инструкции.',
      ],
      urgency: group === 'brassicas' || group === 'leafy' ? 'medium' : 'low',
    })
  }

  if (input.symptom === 'pests') {
    let score = 5
    if (hasCondition(input, 'greenhouse')) score += 1
    if (hasCondition(input, 'hot_dry')) score += 1
    if (group === 'solanaceae' || group === 'cucurbits' || group === 'berries') score += 1
    pushFinding(findings, {
      id: 'sucking_pests',
      score,
      title: 'Похоже на сосущих вредителей',
      summary: 'Мелкие насекомые на листьях и побегах часто тянут за собой скручивание, липкость, тусклый цвет и остановку роста.',
      checks: [
        'Проверьте нижнюю сторону листа и верхушки побегов.',
        'Посмотрите, нет ли липкого налёта, паутинки или светлых точек-проколов.',
        'Оцените, не заселяются ли вредители на соседних растениях рядом.',
      ],
      actions: [
        'Смойте часть вредителей водой там, где это безопасно.',
        'Удалите самые заселённые листья или верхушки, если очаг локальный.',
        'Если вредитель держится, используйте точечную обработку по инструкции.',
      ],
      urgency: 'medium',
    })
  }

  if (input.symptom === 'yellowing') {
    if (input.zone === 'lower' || input.zone === 'everywhere' || !input.zone) {
      let score = 4
      if (input.zone === 'lower') score += 1
      if (hasCondition(input, 'soil_wet') || hasCondition(input, 'soil_dry')) score += 1
      pushFinding(findings, {
        id: 'nitrogen_or_root_stress',
        score,
        title: 'Похоже на нехватку питания или стресс корней',
        summary: 'Когда желтеть начинают нижние старые листья, чаще всего причина в азотном голодании или в том, что корни плохо работают из-за влаги и холода.',
        checks: [
          'Сравните старые и молодые листья: если молодые пока зеленее, версия усиливается.',
          'Проверьте фактическую влажность у корней, а не только поверхность.',
          'Вспомните, давно ли была рабочая подкормка и нет ли затяжного холода.',
        ],
        actions: [
          'Выровняйте полив и не держите корни всё время в сырости.',
          'Дайте мягкую подкормку, если давно не кормили и растение активно растёт.',
          'Не усиливайте питание резко, пока не проверите влажность и температуру почвы.',
        ],
        urgency: 'low',
      })
    }

    if (input.zone === 'upper' || input.zone === 'edges') {
      let score = 4
      if (input.zone === 'upper') score += 1
      if (group === 'berries') score += 1
      if (hasCondition(input, 'after_feeding')) score += 1
      pushFinding(findings, {
        id: 'chlorosis_or_microelements',
        score,
        title: input.zone === 'edges' ? 'Похоже на краевой стресс или калийную проблему' : 'Похоже на хлороз или нехватку микроэлементов',
        summary: input.zone === 'edges'
          ? 'Подсыхание и пожелтение по краям чаще связано с режимом полива, солями после подкормки или калийным стрессом.'
          : 'Когда сильнее желтеют молодые верхние листья, часто страдает усвоение железа и других микроэлементов.',
        checks: [
          'Посмотрите, остаются ли жилки зеленее самой ткани листа.',
          'Вспомните, не было ли перекорма или резкой подкормки недавно.',
          'Проверьте, не пересыхает ли почва рывками между поливами.',
        ],
        actions: [
          'На пару дней стабилизируйте полив без крайностей.',
          'Не добавляйте повторную жёсткую подкормку, пока не станет понятнее причина.',
          'Если желтеет именно молодое, подумайте о мягкой корректирующей подкормке по листу или под корень.',
        ],
        urgency: 'low',
      })
    }
  }

  if (input.symptom === 'curling') {
    let stressScore = 4
    if (hasCondition(input, 'hot_dry') || hasCondition(input, 'soil_dry')) stressScore += 2
    if (hasCondition(input, 'cold_nights')) stressScore += 1
    pushFinding(findings, {
      id: 'weather_stress_curling',
      score: stressScore,
      title: 'Похоже на погодный или водный стресс',
      summary: 'Скручивание часто бывает не отдельной болезнью, а реакцией растения на жару, сухой воздух, пересушку корней или холодные ночи.',
      checks: [
        'Сравните утро и день: если утром лучше, а днём хуже, это усиливает стрессовую версию.',
        'Проверьте, не перегревается ли теплица и не гуляет ли резко влажность.',
        'Посмотрите, нет ли одновременно мелких вредителей на нижней стороне листьев.',
      ],
      actions: [
        'Выровняйте полив без резких перепадов между сухо и сыро.',
        'В жару давайте больше проветривания и мягкого притенения, если нужно.',
        'Если рядом есть вредители, переходите к их точечной проверке и обработке.',
      ],
      urgency: hasCondition(input, 'cold_nights') && WARM_LOVING_CROPS.has(cropId) ? 'medium' : 'low',
    })
  }

  if (input.symptom === 'wilting') {
    let wetScore = 3
    if (hasCondition(input, 'soil_wet') || hasCondition(input, 'after_rain')) wetScore += 2
    if (input.part === 'root' || input.zone === 'base') wetScore += 1
    pushFinding(findings, {
      id: 'waterlogging_root_issue',
      score: wetScore,
      title: 'Похоже на перелив или корневой стресс',
      summary: 'Вялость при сырой почве часто говорит не о нехватке воды, а о том, что корни задыхаются или подгнивают.',
      checks: [
        'Проверьте землю на глубине 5-10 см: не липкая ли она и не пахнет ли затхло.',
        'Посмотрите, не темнеет ли основание стебля и не мягче ли ткань у шейки.',
        'Сравните растения в более сухом и более сыром месте участка.',
      ],
      actions: [
        'Приостановите полив, пока верх и глубина не станут умеренно влажными.',
        'Разрыхлите поверхность и дайте больше проветривания, если это теплица.',
        'Если основание темнеет и размягчается, быстро изолируйте самые слабые растения.',
      ],
      urgency: hasCondition(input, 'soil_wet') ? 'high' : 'medium',
    })

    let dryScore = 3
    if (hasCondition(input, 'soil_dry') || hasCondition(input, 'hot_dry')) dryScore += 2
    if (WARM_LOVING_CROPS.has(cropId)) dryScore += 1
    pushFinding(findings, {
      id: 'drought_heat_issue',
      score: dryScore,
      title: 'Похоже на пересушку или перегрев',
      summary: 'Если растение вянет в жару и почва реально сухая, чаще всего причина в дефиците влаги или перегреве корней и листьев.',
      checks: [
        'Проверьте глубину влажности, а не только верхний слой.',
        'Посмотрите, восстанавливается ли тургор к вечеру или ранним утром.',
        'Оцените, не перегревается ли теплица и не слишком ли горячая почва у поверхности.',
      ],
      actions: [
        'Дайте ровный, не ударный полив с хорошим промачиванием корней.',
        'По возможности прикройте почву мульчей, чтобы сбить испарение.',
        'В жаркий день не делайте агрессивных подкормок и обработок.',
      ],
      urgency: 'medium',
    })
  }

  if (input.symptom === 'rot') {
    if (input.part === 'fruit' || input.zone === 'fruits') {
      let score = 4
      if (group === 'solanaceae' || group === 'cucurbits') score += 2
      if (hasCondition(input, 'soil_dry') || hasCondition(input, 'hot_dry')) score += 1
      pushFinding(findings, {
        id: 'fruit_rot',
        score,
        title: group === 'solanaceae' || group === 'cucurbits' ? 'Похоже на вершинную или мокрую гниль плода' : 'Похоже на проблему с плодовой гнилью',
        summary: group === 'solanaceae' || group === 'cucurbits'
          ? 'У плодовых культур гниль часто запускают скачки влаги, перегрев и сбои в питании плода.'
          : 'Гниль на плодах чаще усиливается на фоне сырости, трещин и повреждений.',
        checks: [
          'Посмотрите, начинается ли проблема с кончика плода или с повреждённого места.',
          'Сравните плоды с разной нагрузкой и разным режимом полива.',
          'Проверьте, нет ли на плоде трещин, укусов или вторичного налёта.',
        ],
        actions: [
          'Уберите явно поражённые плоды, чтобы не тянуть растение вниз.',
          'Стабилизируйте полив без качелей между сухо и сыро.',
          'Не давайте концентрированную подкормку по пересушенной почве.',
        ],
        urgency: 'medium',
      })
    }

    if (input.part === 'stem' || input.part === 'root' || input.zone === 'base') {
      let score = 5
      if (hasCondition(input, 'soil_wet') || hasCondition(input, 'after_rain')) score += 2
      pushFinding(findings, {
        id: 'stem_root_rot',
        score,
        title: 'Похоже на прикорневую или стеблевую гниль',
        summary: 'Потемнение и размягчение у основания стебля или в зоне шейки уже ближе к опасной проблеме, чем просто к стрессу.',
        checks: [
          'Осмотрите шейку растения: есть ли мокнущая тёмная ткань и перетяжка.',
          'Проверьте, не слишком ли долго держится сырость у основания.',
          'Сравните с соседними растениями в том же месте.',
        ],
        actions: [
          'Срочно уберите полив по проблемному месту и дайте проветривание.',
          'Изолируйте самые слабые экземпляры, если гниль идёт быстро.',
          'Уберите сильно поражённые части, если они уже не восстановятся.',
        ],
        urgency: 'high',
      })
    }
  }

  if (input.symptom === 'poor_growth') {
    let score = 4
    if (hasCondition(input, 'cold_nights') || hasCondition(input, 'soil_wet') || hasCondition(input, 'soil_dry')) score += 1
    pushFinding(findings, {
      id: 'growth_stall',
      score,
      title: 'Похоже на остановку роста из-за корней, холода или питания',
      summary: 'Слабый рост без явной яркой болезни чаще связан с тем, что растение упёрлось в корневой стресс, температуру или мягкий дефицит питания.',
      checks: [
        'Сравните новые листья с прошлой неделей: есть ли прирост вообще.',
        'Проверьте, не холодная ли почва и не уплотнена ли она у корней.',
        'Посмотрите, не забило ли растение сорняками, теснотой или перегрузкой урожаем.',
      ],
      actions: [
        'Сначала выровняйте полив и условия, а потом уже усиливайте питание.',
        'Дайте растению стабильный режим без резких обработок.',
        'Если рост стоит давно, переходите к мягкой подкормке после проверки влажности и температуры почвы.',
      ],
      urgency: 'low',
    })
  }

  if ((input.symptom === 'spots' || input.symptom === 'yellowing' || input.symptom === 'wilting' || input.symptom === 'curling') && hasCondition(input, 'cold_nights') && WARM_LOVING_CROPS.has(cropId)) {
    pushFinding(findings, {
      id: 'cold_stress',
      score: 5,
      title: 'Похоже на холодовой стресс',
      summary: 'Для тёплолюбивых культур прохладные ночи могут давать пятна, тусклость, скручивание и общую заторможенность без настоящей инфекции.',
      checks: [
        'Вспомните, стало ли хуже сразу после серии холодных ночей.',
        'Посмотрите, страдают ли сильнее верхушки и молодой прирост.',
        'Сравните открытые места и более защищённые участки.',
      ],
      actions: [
        'На ближайшие холодные ночи дайте укрытие или снизьте продувание.',
        'Не перегружайте растение жёсткими обработками сразу после стресса.',
        'Подождите 1-2 тёплых дня и посмотрите, стабилизируется ли новый рост.',
      ],
      urgency: 'medium',
    })
  }

  if ((input.symptom === 'spots' || input.symptom === 'yellowing') && hasCondition(input, 'after_feeding') && (input.zone === 'edges' || input.zone === 'everywhere')) {
    pushFinding(findings, {
      id: 'salt_burn',
      score: 5,
      title: 'Похоже на ожог после подкормки',
      summary: 'Если стало хуже вскоре после подкормки, особенно по краям и кончикам листа, возможен солевой ожог или слишком концентрированный раствор.',
      checks: [
        'Вспомните дозировку и по влажной ли почве давали подкормку.',
        'Посмотрите, сильнее ли пострадали края и кончики.',
        'Проверьте, не затронуты ли сразу несколько растений после одной процедуры.',
      ],
      actions: [
        'Не повторяйте подкормку в ближайшие дни.',
        'Если почва безопасно дренирует, выровняйте влагу умеренным поливом.',
        'Дайте растению время и наблюдайте новый прирост, а не старые повреждённые листья.',
      ],
      urgency: 'low',
    })
  }

  findings.sort((left, right) => right.score - left.score)

  if (findings.length === 0) {
    return [{
      id: 'need_more_checks',
      title: 'Нужна дополнительная проверка',
      summary: 'По выбранным симптомам пока не складывается уверенная версия. Лучше сузить картину по месту проблемы и условиям.',
      checks: [
        'Посмотрите, что появилось первым: пятна, увядание, насекомые или налёт.',
        'Отметьте, что происходит с почвой: сухо, сыро, холодно или жарко.',
        'Сравните молодые и старые листья, а также разные части растения.',
      ],
      actions: [
        'Сначала не спешите с сильной обработкой.',
        'Уберите самые явно повреждённые части, если их мало.',
        'Если симптомы усиливаются, сделайте повторную диагностику с уточнёнными признаками.',
      ],
      urgency: 'low',
    }]
  }

  return findings.slice(0, 3).map(finding => {
    const { score, ...rest } = finding
    void score
    return rest
  })
}

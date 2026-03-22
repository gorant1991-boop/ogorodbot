# Rефакторинг OgorodBot - План и Структура

## 📊 Текущее состояние

**App.tsx:** 2914 строк 🔴 (ОЧЕНЬ БОЛЬШОЙ!)
- 9 основных screen компонентов
- 2 modal компонента
- 4 custom hooks
- ~1000+ строк констант и данных
- Утилиты для экспорта, луны, погоды

## 🎯 Цель рефакторинга

Снизить App.tsx с 2914 задо ~500-700 строк путём правильной модуляризации.

---

## 📁 Новая структура

```
src/
├── components/                      # React компоненты (экраны и модали)
│   ├── screens/
│   │   ├── OnboardingScreen.tsx      # 11-шаговый онбординг
│   │   ├── MainScreen.tsx            # Главная навигация с табами
│   │   ├── PlantsScreen.tsx          # Обзор посадок + погода
│   │   ├── MoonScreen.tsx            # Лунный календарь + AI план
│   │   ├── CompatScreen.tsx          # Совместимость культур
│   │   ├── DiseaseScreen.tsx         # Риск болезней
│   │   ├── DiaryScreen.tsx           # Дневник операций
│   │   ├── SeasonsScreen.tsx         # История сезонов
│   │   └── ProfileScreen.tsx         # Профиль + экспорт
│   ├── modals/
│   │   ├── CropVarietyPickerModal.tsx
│   │   ├── CropEditModal.tsx
│   │   └── DeleteAccountModal.tsx    # Подтверждение удаления
│   ├── ui/
│   │   ├── TermsCheckbox.tsx
│   │   ├── ProgressBar.tsx
│   │   ├── NavButtons.tsx
│   │   ├── LunarBadge.tsx
│   │   └── WeatherWidget.tsx
│   └── index.ts
│
├── hooks/                           # Custom React hooks
│   ├── useAppState.ts              # Управление состоянием (VK, userData, screen)
│   ├── useWeather.ts               # Получение погоды от OpenWeatherMap
│   ├── useMoon.ts                  # Расчёты лунной фазы
│   ├── useForecast.ts              # 7-дневный прогноз
│   ├── useWeeklyPlan.ts            # AI еженедельный план
│   └── index.ts
│
├── api/                             # API интеграции
│   ├── supabase.ts                 # Supabase функции
│   ├── weather.ts                  # OpenWeatherMap API
│   └── index.ts
│
├── utils/                           # Утилиты
│   ├── export.ts                   # Экспорт CSV/HTML
│   ├── helpers.ts                  # makeUid, daysSince, getCropStage
│   ├── types.ts                    # Все TypeScript интерфейсы
│   ├── index.ts
│   └── constants/                  # Константы (отдельная папка)
│       ├── crops.ts                # CROP_DAYS, CROP_CATEGORIES, CROP_OPS и т.д.
│       ├── moon.ts                 # MOON_PHASES, MOON_GOOD, MOON_BAD
│       ├── weather.ts              # DISEASE_MATRIX, WEATHER_CONDITIONS
│       ├── ui.ts                   # NOTIF_CHANNELS, SOIL_LABELS, PLANS и т.д.
│       └── index.ts
│
├── App.tsx                          # Главный компонент (150-200 строк вместо 2914)
├── App.css
├── index.css
└── main.tsx
```

---

## 📋 План рефакторинга

### Этап 1: Извлечение констант (~2-3 часа)
- [ ] **utils/constants/crops.ts** — CROP_DAYS, CROP_CATEGORIES, CROP_VARIETIES, CROP_OPERATIONS, CROP_COMPAT
- [ ] **utils/constants/moon.ts** — MOON_PHASES, MOON_GOOD, MOON_BAD
- [ ] **utils/constants/weather.ts** — DISEASE_MATRIX, getWeatherRisks()
- [ ] **utils/constants/ui.ts** — NOTIF_CHANNELS, GROW_OPTIONS, SOIL_LABELS, PLANS, FAQ_ITEMS
- [ ] **utils/types.ts** — все интерфейсы (GardenObject, CropEntry и т.д.)

**Результат:** Удаляем первые 1000+ строк из App.tsx

### Этап 2: Извлечение утилит (1-2 часа)
- [ ] **utils/helpers.ts** — makeUid(), daysSince(), getCropStage(), getOps() и т.д.
- [ ] **utils/export.ts** — exportCSV(), exportHTML()

**Результат:** Ещё 150+ строк убрано

### Этап 3: Создание hooks (2-3 часа)
- [ ] **hooks/useAppState.ts** — VK Bridge, userData, screen navigation, diary
- [ ] **hooks/useWeather.ts** — fetch текущей погоды
- [ ] **hooks/useMoon.ts** — расчёты луны + лунные фазы
- [ ] **hooks/useForecast.ts** — прогноз на 7 дней
- [ ] **hooks/useWeeklyPlan.ts** — AI еженедельный план

**Результат:** Логика выделена в переиспользуемые hooks

### Этап 4: Извлечение компонентов экранов (4-5 часов)
- [ ] **components/screens/OnboardingScreen.tsx** — 11 шагов, GardenObject, CropEntry
- [ ] **components/screens/MainScreen.tsx** — табы (main, plants, diary, moon, profile)
- [ ] **components/screens/PlantsScreen.tsx** — список культур, погода, операции
- [ ] **components/screens/MoonScreen.tsx** — lunar calendar, weekly AI plan
- [ ] **components/screens/CompatScreen.tsx** — матрица совместимости
- [ ] **components/screens/DiseaseScreen.tsx** — риск болезней
- [ ] **components/screens/DiaryScreen.tsx** — дневник с фильтрацией
- [ ] **components/screens/SeasonsScreen.tsx** — история сезонов
- [ ] **components/screens/ProfileScreen.tsx** — профиль, FAQ, экспорт

**Результат:** Каждый экран в своём файле, легче редактировать

### Этап 5: Извлечение модалей и UI компонентов (1-2 часа)
- [ ] **components/modals/CropVarietyPickerModal.tsx**
- [ ] **components/modals/CropEditModal.tsx**
- [ ] **components/modals/DeleteAccountModal.tsx**
- [ ] **components/ui/** — TermsCheckbox, ProgressBar, NavButtons, LunarBadge, WeatherWidget

**Результат:** Переиспользуемые UI компоненты

### Этап 6: Переорганизация App.tsx (30 минут)
- [ ] Импортировать все компоненты и hooks
- [ ] Оставить только навигацию между экранами
- [ ] Убрать все константы и логику

**Результат:** App.tsx сократилась с 2914 до 150-200 строк (92% редукция! 🎉)

### Этап 7: Обновление импортов (1 час)
- [ ] Обновить main.tsx
- [ ] Проверить все относительные импорты
- [ ] Добавить index.ts файлы для каждой папки

**Результат:** Весь проект работает с новой структурой

### Этап 8: Добавить lazy loading (опционально, 1 час)
- [ ] Использовать React.lazy() для экранов
- [ ] Добавить Suspense fallback
- [ ] Улучшить performance для мобильных

**Результат:** Быстрая первая загрузка

---

## 📊 Ожидаемые результаты

| Метрика | До | После | Улучшение |
|---------|-----|--------|-----------|
| App.tsx | 2914 строк | 150-200 строк | **92% ↓** |
| Модульность | 1 большой файл | 15+ файлов | ✅ |
| Переиспользование | Нет | hooks + components | ✅ |
| Тестируемость | Сложно | Легко | ✅ |
| Производительность | Хорошо | Отично (с lazy load) | ✅ |
| Команде легче | 🔴 Нет | 🟢 Да | ✅ |

---

## ⏱️ Общее время

- **Оптимистично:** 8-10 часов
- **Реально:** 12-15 часов (с тестированием)
- **С lazy loading:** +2-3 часа

---

## 🚀 Приоритет этапов

🟢 **Критичные (выполнить первыми):**
1. Этап 1: Извлечение констант
2. Этап 2: Извлечение утилит
3. Этап 6: Переорганизация App.tsx

🟡 **Важные:**
4. Этап 3: Создание hooks
5. Этап 4: Извлечение компонентов экранов

🟢 **Опционально:**
6. Этап 5: Модали и UI компоненты
7. Этап 8: Lazy loading

---

## ✅ Что начать первым?

Рекомендую начать с этапа 1 (извлечение констант). Это:
- ✅ Быстро видны результаты
- ✅ Не требует переписывания логики
- ✅ Снижает файл App.tsx на 30-40%
- ✅ Подготавливает почву для остального

**Начнём с констант?** 🚀

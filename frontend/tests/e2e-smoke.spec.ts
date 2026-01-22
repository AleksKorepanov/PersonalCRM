import { test, expect } from '@playwright/test'

test('smoke: создать контакт, добавить interaction, увидеть таймлайн', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('tab-contacts').click()
  await page.getByRole('button', { name: 'Создать контакт' }).click()
  await page.getByTestId('contact-display-name').fill('Контакт для e2e')
  await page.getByTestId('contact-create').click()

  await expect(page.getByTestId('contacts-list')).toContainText('Контакт для e2e')

  const openButtons = page.getByRole('button', { name: 'Открыть' })
  await openButtons.first().click()

  await page.getByRole('button', { name: 'Таймлайн' }).click()
  await page.getByRole('button', { name: 'Добавить взаимодействие' }).click()

  await page.getByLabel('Итог / заметка').fill('E2E взаимодействие')
  await page.getByRole('button', { name: 'Сохранить' }).click()

  await expect(page.getByText('E2E взаимодействие').first()).toBeVisible()
})

test('smoke: создать интродукцию из карточки контакта', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('tab-contacts').click()
  await page.getByRole('button', { name: 'Создать контакт' }).click()
  await page.getByTestId('contact-display-name').fill('Контакт A для интро')
  await page.getByTestId('contact-create').click()

  await page.getByRole('button', { name: 'Создать контакт' }).click()
  await page.getByTestId('contact-display-name').fill('Контакт B для интро')
  await page.getByTestId('contact-create').click()

  await expect(page.getByTestId('contacts-list')).toContainText('Контакт A для интро')
  await page.getByRole('button', { name: 'Открыть' }).first().click()

  await page.getByRole('button', { name: 'Создать интродукцию' }).click()
  await page.getByLabel('Кого представить').fill('Контакт B')
  await page.getByRole('button', { name: 'Контакт B для интро' }).first().click()
  await page.getByLabel('Цель').fill('Познакомить для проекта')
  await page.getByLabel('Критерии').fill('Полезный опыт в B2B')
  await page.getByLabel('Сообщение для интро').fill('Короткое интро сообщение')
  await page.getByRole('button', { name: 'Сохранить' }).click()

  await expect(page.getByText('Интродукция создана (черновик).')).toBeVisible()
})

test('smoke: создать напоминание из карточки контакта', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('tab-contacts').click()
  await page.getByRole('button', { name: 'Создать контакт' }).click()
  await page.getByTestId('contact-display-name').fill('Контакт для напоминания')
  await page.getByTestId('contact-create').click()

  await page.getByRole('button', { name: 'Открыть' }).first().click()
  await page.getByRole('button', { name: 'Поставить напоминание' }).click()
  await page.getByLabel('Заголовок').fill('Напомнить про встречу')
  await page.getByLabel('Дата и время').fill('2026-01-21T10:00')
  await page.getByLabel('Комментарий').fill('Тестовое напоминание')
  await page.getByRole('button', { name: 'Сохранить' }).click()

  await expect(page.getByText('Напоминание создано.')).toBeVisible()
})

test('smoke: приватность ролей и доступ к аудиту', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('tab-contacts').click()
  await page.getByRole('button', { name: 'Создать контакт' }).click()
  await page.getByTestId('contact-display-name').fill('Приватный контакт для ролей')
  await page.getByLabel('Видимость').selectOption('private')
  await page.getByTestId('contact-create').click()

  await page.getByRole('button', { name: 'Создать контакт' }).click()
  await page.getByTestId('contact-display-name').fill('Общий контакт для ролей')
  await page.getByTestId('contact-create').click()

  await expect(page.getByTestId('contacts-list')).toContainText('Приватный контакт для ролей')
  await expect(page.getByTestId('contacts-list')).toContainText('Общий контакт для ролей')

  await page.getByLabel('Режим роли (dev)').selectOption('assistant')
  await expect(page.getByTestId('contacts-list')).not.toContainText('Приватный контакт для ролей')
  await expect(page.getByTestId('contacts-list')).toContainText('Общий контакт для ролей')

  await page.getByRole('link', { name: 'Аудит' }).click()
  await expect(page.getByRole('heading', { name: 'Нет доступа' })).toBeVisible()
})

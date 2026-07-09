# EIA Dashboard

Простой дашборд для визуализации данных Energy Information Administration (EIA).

## Установка и запуск

1. Установите зависимости:
   pip install -r requirements.txt
2. Получите бесплатный ключ на https://www.eia.gov/opendata/register.php
3. Создайте файл `.env` рядом с `app.py`:
   EIA_API_KEY=ваш_ключ
4. Запустите:
   python app.py
5. Откройте http://127.0.0.1:5000

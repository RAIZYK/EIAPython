Запуск:
    1) pip install -r requirements.txt
    2) получить бесплатный ключ: https://www.eia.gov/opendata/register.php
    3) создать файл .env рядом с app.py:
           EIA_API_KEY=ваш_ключ
    4) python app.py
    5) открыть http://127.0.0.1:5000
(`/api/routes`, `/api/facet`, `/api/data`). Поэтому на следующем этапе,
когда нужно будет подключить React Native, достаточно переиспользовать те же
3 эндпоинта и просто заменить `static/*` на экраны React Native — сам Flask
трогать не придётся.

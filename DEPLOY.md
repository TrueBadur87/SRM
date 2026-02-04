# Деплой на Render.com

## Автоматический деплой (рекомендуется)

1. Загрузите проект на GitHub
2. Зайдите на https://dashboard.render.com/
3. Нажмите "New +" → "Web Service"
4. Подключите ваш GitHub репозиторий
5. Render автоматически обнаружит файл `render.yaml` и настроит всё сам

## Ручная настройка

Если автоматический деплой не работает, настройте вручную:

### Настройки на Render.com:

**Environment:** Python

**Build Command:**
```bash
cd frontend && npm install && npm run build && cd ../backend && pip install -r requirements.txt
```

**Start Command:**
```bash
cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT
```

**Environment Variables:**
- `PYTHON_VERSION`: `3.11`

### Важно:

1. Render автоматически подставит переменную `$PORT` - не указывайте порт вручную
2. База данных SQLite создастся автоматически при первом запуске
3. После деплоя ваше приложение будет доступно по адресу типа: `https://your-app-name.onrender.com`

## Локальный запуск

### Windows:
```batch
start.bat
```

### Linux/Mac:
```bash
chmod +x start.sh
./start.sh
```

## Только backend:

### Windows:
```batch
start-backend.bat
```

### Linux/Mac:
```bash
chmod +x start-backend.sh
./start-backend.sh
```

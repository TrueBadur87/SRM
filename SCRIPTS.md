# Скрипты запуска

## Windows

### Полный запуск (рекомендуется)
```batch
start.bat
```
Этот скрипт:
1. Установит зависимости frontend
2. Соберет frontend в `frontend/dist/`
3. Запустит backend на http://localhost:15000

Frontend будет доступен по тому же адресу: http://localhost:15000/

### Только backend
```batch
start-backend.bat
```
Запускает только backend сервер (без сборки frontend).

### Только frontend (для разработки)
```batch
start-frontend.bat
```
Запускает Vite dev server на http://localhost:5173

---

## Linux/Mac

### Первый запуск - сделать скрипты исполняемыми:
```bash
chmod +x *.sh
```

### Полный запуск (рекомендуется)
```bash
./start.sh
```
Этот скрипт:
1. Установит зависимости frontend
2. Соберет frontend в `frontend/dist/`
3. Установит зависимости backend
4. Запустит backend на http://localhost:15000

Frontend будет доступен по тому же адресу: http://localhost:15000/

### Только backend
```bash
./start-backend.sh
```
Запускает только backend сервер (без сборки frontend).

### Только сборка frontend
```bash
./build.sh
```
Только устанавливает зависимости и собирает frontend.

---

## Доступ к приложению

После запуска любого из скриптов:

- **Приложение:** http://localhost:15000/
- **API документация:** http://localhost:15000/docs
- **API (альтернативная документация):** http://localhost:15000/redoc
- **Health check:** http://localhost:15000/health

---

## Production (Render.com)

Для деплоя на Render.com см. инструкцию в [DEPLOY.md](DEPLOY.md)

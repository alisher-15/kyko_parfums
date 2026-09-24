# Исходные данные

Положите сюда Excel-базу каталога (например, `catalog.xlsx`). Содержимое папки,
кроме этого файла, не попадает в git — прайсы остаются приватными.

Импорт:

```bash
# локально
cd backend && python -m app.cli import-catalog ../data/catalog.xlsx --dry-run   # проверка
cd backend && python -m app.cli import-catalog ../data/catalog.xlsx             # запись

# в docker compose (папка data смонтирована в /data)
docker compose exec backend python -m app.cli import-catalog /data/catalog.xlsx
```

Или через админку: «Импорт Excel» → выбрать файл → «Проверить» → «Импортировать».

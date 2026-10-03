param([ValidateSet('up','down','seed','logs')][string]$Action='up')
if($Action -eq 'up'){docker compose up -d --build}
elseif($Action -eq 'down'){docker compose down}
elseif($Action -eq 'seed'){Get-Content migrations/000002_seed_data.up.sql | docker compose exec -T postgres psql -U labproctor -d labproctor}
else{docker compose logs -f server worker}

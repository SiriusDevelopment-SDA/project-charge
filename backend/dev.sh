#!/bin/bash
# Script de desenvolvimento com hot reload
# Uso: ./dev.sh [start|stop|restart|logs]

ACTION=${1:-start}

case "$ACTION" in
  start)
    echo "Iniciando ambiente de desenvolvimento..."
    docker compose -f docker-compose.dev.yml up
    ;;
  start-bg)
    echo "Iniciando em background..."
    docker compose -f docker-compose.dev.yml up -d
    echo "API rodando em http://localhost:3000"
    echo "Para ver os logs: ./dev.sh logs"
    ;;
  stop)
    echo "Parando ambiente..."
    docker compose -f docker-compose.dev.yml down
    ;;
  restart)
    echo "Reiniciando..."
    docker compose -f docker-compose.dev.yml down
    docker compose -f docker-compose.dev.yml up
    ;;
  logs)
    docker compose -f docker-compose.dev.yml logs -f api
    ;;
  *)
    echo "Uso: ./dev.sh [start|start-bg|stop|restart|logs]"
    exit 1
    ;;
esac

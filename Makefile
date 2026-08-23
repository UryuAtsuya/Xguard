.DEFAULT_GOAL := dev

.PHONY: dev frontend backend customer admin help

dev:
	@node scripts/dev-processes.mjs all

frontend:
	@node scripts/dev-processes.mjs frontend

backend:
	@node scripts/dev-processes.mjs backend

customer:
	@node scripts/dev-processes.mjs customer

admin:
	@node scripts/dev-processes.mjs admin

help:
	@echo "make           backend + customer + admin"
	@echo "make frontend  customer + admin"
	@echo "make backend   backend only"
	@echo "make customer  customer only"
	@echo "make admin     admin only"

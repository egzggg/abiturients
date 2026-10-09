.PHONY: run

# Next.js serves both the frontend and backend API routes.
run:
	@if [ ! -x dashboard/node_modules/.bin/next ]; then npm --prefix dashboard ci; fi
	npm --prefix dashboard run dev -- -H 0.0.0.0

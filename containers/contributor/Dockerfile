FROM node:24-bookworm-slim

WORKDIR /workspace
COPY --chown=node:node . .

ENV CI=true \
    CT_CONTRIBUTOR_OFFLINE=1 \
    NODE_ENV=test \
    NO_COLOR=1 \
    npm_config_offline=true

USER node
ENTRYPOINT ["node", "scripts/run-contributor-tests.mjs"]
CMD ["--profile", "all"]

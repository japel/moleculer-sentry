/*
 * moleculer-sentry
 * Copyright (c) 2022 LuxChan S.A R.L.-S (https://github.com/LuxChanLu/moleculer-sentry)
 * MIT Licensed
 */

'use strict'

const Sentry = require('@sentry/node');
const SentryUtils = require('@sentry/utils');

module.exports = {
  name: 'sentry',

  /**
   * Default settings
   */
  settings: {
    /** @type {Object?} Sentry configuration wrapper. */
    sentry: {
      /** @type {String} DSN given by sentry. */
      dsn: null,
      /** @type {Object} Additional options for `Sentry.init`. */
      options: {},
      scope: {
        /** @type {String?} Name of the meta containing user infos */
        user: null
      }
    }
  },

  /**
	 * Events
	 */
  events: {
    'metrics.trace.span.finish'(metric) {
      if (metric.error && this.isSentryReady() && (!this.shouldReport || this.shouldReport(metric) == true)) {
        this.sendSentryError(metric)
      }
    }
  },

  /**
   * Methods
   */
  methods: {
    /**
     * Get service name from metric event (Imported from moleculer-jaeger)
     *
     * @param {Object} metric
     * @returns {String}
     */
    getServiceName(metric) {
      if (!metric.service && metric.action) {
        const parts = metric.action.name.split('.')
        parts.pop()
        return parts.join('.')
      }
      return metric.service && metric.service.name ? metric.service.name : metric.service
    },

    /**
     * Get span name from metric event. By default it returns the action name (Imported from moleculer-jaeger)
     *
     * @param {Object} metric
     * @returns  {String}
     */
    getSpanName(metric) {
      return metric.action ? metric.action.name : metric.name
    },

    /**
     * Get object key under which user is stored in service meta
     *
     * @returns  {String}
     */
    getUserMetaKey() {
      return this.settings.sentry.userMetaKey
    },

    /**
     * We need to normalize the stack trace, since Sentry will throw an error unless it's a valid raw stack trace
     *
     * @param stack
     * @returns {null|*[]|*}
     */
    getNormalizedStackTrace(stack) {
      // empty stack trace is not parseable by sentry,
      if (!stack) {
        return null
      }

      // if stacktrace is present as a string, wrap it into an array
      if (!Array.isArray(stack)) {
        return [stack];
      }

      return stack;
    },

    /**
     * Send error to sentry, based on the metric error
     *
     * @param {Object} metric
     */
    sendSentryError(metric) {
      Sentry.withScope((scope) => {
        scope.setTag('id', metric.requestID)
        scope.setTag('service', this.getServiceName(metric))
        scope.setTag('span', this.getSpanName(metric))
        scope.setTag('type', metric.error.type)
        scope.setTag('code', metric.error.code)

        if (metric.error.data) {
          scope.setExtra('data', metric.error.data)
        }

        if (this.settings.scope && this.settings.scope.user && metric.meta && metric.meta[this.settings.scope.user]) {
          scope.setUser(metric.meta[this.settings.scope.user])
        }

        Sentry.captureEvent({
          message: metric.error.message,
          stacktrace: this.getNormalizedStackTrace(metric.error.stack)
        })
      })
    },

    /**
     * Check if sentry is configured or not
     */
    isSentryReady() {
      return Sentry.getCurrentHub().getClient() !== undefined
    },
  },

  started() {
    const dsn = this.settings.sentry.dsn
    const options = this.settings.sentry.options

    if (dsn) {
      Sentry.init({ dsn, ...options })
    }
  },

  async stopped() {
    if (this.isSentryReady()) {
      await Sentry.flush()
      SentryUtils.GLOBAL_OBJ.__SENTRY__ = undefined
    }
  }
}

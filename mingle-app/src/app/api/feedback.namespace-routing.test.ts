import { describe, expect, it } from 'vitest'

import { GET as getFeedback, POST as postFeedback } from '@/app/api/feedback/route'
import {
  GET as getAndroidV107Feedback,
  POST as postAndroidV107Feedback,
} from '@/app/api/android/v1.0.7/feedback/route'
import {
  GET as getAndroidV108Feedback,
  POST as postAndroidV108Feedback,
} from '@/app/api/android/v1.0.8/feedback/route'
import {
  GET as getAndroidV109Feedback,
  POST as postAndroidV109Feedback,
} from '@/app/api/android/v1.0.9/feedback/route'
import {
  GET as getAndroidV110Feedback,
  POST as postAndroidV110Feedback,
} from '@/app/api/android/v1.0.12/feedback/route'
import {
  GET as getIosV107Feedback,
  POST as postIosV107Feedback,
} from '@/app/api/ios/v1.0.7/feedback/route'
import {
  GET as getIosV108Feedback,
  POST as postIosV108Feedback,
} from '@/app/api/ios/v1.0.8/feedback/route'
import {
  GET as getIosV109Feedback,
  POST as postIosV109Feedback,
} from '@/app/api/ios/v1.0.9/feedback/route'
import {
  GET as getIosV110Feedback,
  POST as postIosV110Feedback,
} from '@/app/api/ios/v1.0.12/feedback/route'

describe('feedback namespace route wiring', () => {
  it('maps Android feedback aliases to the shared feedback route', () => {
    expect(getAndroidV107Feedback).toBe(getFeedback)
    expect(postAndroidV107Feedback).toBe(postFeedback)
    expect(getAndroidV108Feedback).toBe(getFeedback)
    expect(postAndroidV108Feedback).toBe(postFeedback)
    expect(getAndroidV109Feedback).toBe(getFeedback)
    expect(postAndroidV109Feedback).toBe(postFeedback)
    expect(getAndroidV110Feedback).toBe(getFeedback)
    expect(postAndroidV110Feedback).toBe(postFeedback)
  })

  it('maps iOS feedback aliases to the shared feedback route', () => {
    expect(getIosV107Feedback).toBe(getFeedback)
    expect(postIosV107Feedback).toBe(postFeedback)
    expect(getIosV108Feedback).toBe(getFeedback)
    expect(postIosV108Feedback).toBe(postFeedback)
    expect(getIosV109Feedback).toBe(getFeedback)
    expect(postIosV109Feedback).toBe(postFeedback)
    expect(getIosV110Feedback).toBe(getFeedback)
    expect(postIosV110Feedback).toBe(postFeedback)
  })
})

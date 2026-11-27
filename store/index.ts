import { configureStore } from '@reduxjs/toolkit'
import emailCampaignReducer from './email-campaign-slice'

export const makeStore = () =>
  configureStore({
    reducer: {
      emailCampaignDraft: emailCampaignReducer,
    },
    devTools: process.env.NODE_ENV !== 'production',
  })

export type AppStore = ReturnType<typeof makeStore>
export type RootState = ReturnType<AppStore['getState']>
export type AppDispatch = AppStore['dispatch']

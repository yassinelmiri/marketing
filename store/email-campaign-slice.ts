import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

type EmailCampaignDraftState = {
  selectedSenderIds: number[]
  selectedListIds: number[]
}

const initialState: EmailCampaignDraftState = {
  selectedSenderIds: [],
  selectedListIds: [],
}

const emailCampaignSlice = createSlice({
  name: 'emailCampaignDraft',
  initialState,
  reducers: {
    setSelectedSenderIds(state, action: PayloadAction<number[]>) {
      state.selectedSenderIds = action.payload
    },
    setSelectedListIds(state, action: PayloadAction<number[]>) {
      state.selectedListIds = action.payload
    },
    clearEmailCampaignSelection(state) {
      state.selectedSenderIds = []
      state.selectedListIds = []
    },
  },
})

export const {
  setSelectedSenderIds,
  setSelectedListIds,
  clearEmailCampaignSelection,
} = emailCampaignSlice.actions

export default emailCampaignSlice.reducer

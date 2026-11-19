declare module 'nodemailer' {
  interface Transporter {
    verify(): Promise<boolean>
    sendMail(options: {
      from: { name: string; address: string }
      to: string
      subject: string
      text: string
    }): Promise<unknown>
    close(): void
  }
  const nodemailer: {
    createTransport(options: {
      host: string
      port: number
      secure: boolean
      auth: { user: string; pass: string }
      connectionTimeout?: number
      greetingTimeout?: number
      socketTimeout?: number
    }): Transporter
  }
  export default nodemailer
}

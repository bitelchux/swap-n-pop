import * as m  from 'mithril'
import {state} from 'devtools/common/data'
import toast   from 'devtools/components/toast'

export default function content_primer(){
  if (state.stage != null) { return }
  return m('.content_wrap.primer',m('.content',
    toast('Data will appear when you start a game and enter step mode')
  ))
}

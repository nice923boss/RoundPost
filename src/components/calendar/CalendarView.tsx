import { useEffect, useMemo, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin, { type DateClickArg } from '@fullcalendar/interaction'
import zhTwLocale from '@fullcalendar/core/locales/zh-tw'
import type { EventClickArg, EventDropArg, EventInput } from '@fullcalendar/core'
import { api, errorMessage } from '../../lib/api.ts'
import { localDate } from '../../lib/date.ts'
import { flushEdits } from '../../stores/editorGuard.ts'
import { usePostStore } from '../../stores/postStore.ts'
import { toast } from '../../stores/toastStore.ts'
import NewPostDialog from '../editor/NewPostDialog.tsx'
import PostDetailPanel from '../editor/PostDetailPanel.tsx'
import { POST_STATUSES, POST_STATUS_LABELS } from '../../../shared/types.ts'

export default function CalendarView() {
  const { posts, loaded, loadPosts } = usePostStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [panelRevision, setPanelRevision] = useState(0)
  const [newPostDate, setNewPostDate] = useState<string | null>(null)

  useEffect(() => {
    if (!loaded) void loadPosts()
  }, [loaded, loadPosts])

  const events = useMemo<EventInput[]>(
    () =>
      posts
        .filter((post) => post.scheduled_date)
        .map((post) => ({
          id: post.id,
          title: post.title || '（無標題）',
          start: post.scheduled_time ? `${post.scheduled_date}T${post.scheduled_time}` : post.scheduled_date!,
          allDay: !post.scheduled_time,
          backgroundColor: `var(--status-${post.status})`,
          borderColor: `var(--status-${post.status})`,
          textColor: '#fff'
        })),
    [posts]
  )
  const unscheduled = posts.length - events.length

  const select = async (id: string | null) => {
    if (id === selectedId) return
    if (await flushEdits()) setSelectedId(id)
  }

  const handleDateClick = (info: DateClickArg) => setNewPostDate(info.dateStr)

  const handleEventClick = (info: EventClickArg) => void select(info.event.id)

  const handleEventDrop = async (info: EventDropArg) => {
    const { id, start } = info.event
    if (!start) return info.revert()
    // Unsaved edits of the moved post are saved first, otherwise they would put the old date back.
    if (id === selectedId && !(await flushEdits())) return info.revert()
    try {
      await api.updatePost(id, { scheduled_date: localDate(start) })
      await loadPosts()
      if (id === selectedId) setPanelRevision((n) => n + 1)
    } catch (err) {
      info.revert()
      toast.error(`更改日期失敗：${errorMessage(err)}`)
    }
  }

  return (
    <div className="page-split">
      <div className="calendar-page page-split-main">
        <div className="page-header">
          <h2>📅 行事曆</h2>
          <div className="calendar-legend">
            {POST_STATUSES.map((s) => (
              <span key={s} className="legend-item">
                <span className={`legend-dot legend-dot--${s}`} /> {POST_STATUS_LABELS[s]}
              </span>
            ))}
          </div>
        </div>
        <p className="hint">
          點日期新增貼文，拖曳貼文可改日期。{unscheduled > 0 && `另有 ${unscheduled} 篇尚未排程，可到儀表板查看。`}
        </p>

        <div className="calendar-container">
          <FullCalendar
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            locale={zhTwLocale}
            headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,dayGridWeek' }}
            buttonText={{ today: '今天', month: '月', week: '週' }}
            events={events}
            editable
            eventDurationEditable={false}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            eventDrop={(info) => void handleEventDrop(info)}
            height="auto"
            dayMaxEvents={4}
            eventDisplay="block"
            eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          />
        </div>
      </div>

      {selectedId && (
        <PostDetailPanel key={`${selectedId}:${panelRevision}`} postId={selectedId} onClose={() => setSelectedId(null)} />
      )}

      {newPostDate && (
        <NewPostDialog
          initialDate={newPostDate}
          onClose={() => setNewPostDate(null)}
          onCreated={(post) => {
            setNewPostDate(null)
            void select(post.id)
          }}
        />
      )}
    </div>
  )
}

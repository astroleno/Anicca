import { Pane } from 'https://cdn.skypack.dev/tweakpane@4.0.4'
// import gsap from 'gsap'
// import { Draggable } from 'gsap/Draggable'
// import InertiaPlugin from 'gsap/InertiaPlugin'
import gsap from 'https://cdn.skypack.dev/gsap@3.13.0'
import { Draggable } from 'https://cdn.skypack.dev/gsap@3.13.0/Draggable'
import InertiaPlugin from 'https://cdn.skypack.dev/gsap@3.13.0/InertiaPlugin'
import Flip from 'https://cdn.skypack.dev/gsap@3.13.0/Flip'

gsap.registerPlugin(Draggable, InertiaPlugin, Flip)

const config = {
  theme: 'system',
  proximity: 120,
  debug: false,
  duration: 0.35,
}

const ctrl = new Pane({
  title: 'config',
  expanded: true,
})

const update = () => {
  document.documentElement.dataset.theme = config.theme
  document.documentElement.dataset.debug = config.debug
  document.documentElement.style.setProperty(
    '--snap-proximity',
    config.proximity
  )
}

const sync = (event) => {
  if (event.target.controller.view.labelElement.innerText === 'debug') {
    document.querySelector('.arrow--debug').style.opacity = 0
  }
  if (
    !document.startViewTransition ||
    event.target.controller.view.labelElement.innerText !== 'theme'
  )
    return update()
  document.startViewTransition(() => update())
}

ctrl.addBinding(config, 'proximity', {
  min: 0,
  max: 300,
  step: 1,
  label: 'proximity',
})

ctrl.addBinding(config, 'duration', {
  min: 0.2,
  max: 5,
  step: 0.01,
  label: 'duration(s)',
})

ctrl.addBinding(config, 'debug', {
  label: 'debug',
})

ctrl.addBinding(config, 'theme', {
  label: 'theme',
  options: {
    System: 'system',
    Light: 'light',
    Dark: 'dark',
  },
})

ctrl.on('change', sync)
update()

// do GSAP stuff
const button = document.querySelector('[aria-label^="Start"]')
const targets = document.querySelectorAll('.target')

function getClosestPoint(target, maxDistance = Number.POSITIVE_INFINITY) {
  if (maxDistance !== Number.POSITIVE_INFINITY)
    document.documentElement.style.setProperty('--snap-proximity', maxDistance)
  let closest = null
  let minDistance = Number.POSITIVE_INFINITY

  const coordinates = Array.from(targets).map((el) => {
    const rect = el.getBoundingClientRect()
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      element: el,
    }
  })

  for (const coord of coordinates) {
    const dx = Math.min(window.innerWidth, Math.max(0, target.x)) - coord.x
    const dy = Math.min(window.innerHeight, Math.max(0, target.y)) - coord.y
    const distance = Math.hypot(dx, dy) // Euclidean distance
    if (distance < minDistance) {
      minDistance = distance
      closest = coord
    }
  }

  if (minDistance <= maxDistance) {
    return {
      coordinate: closest,
      distance: minDistance,
    }
  }

  // If no point is within maxDistance
  return null
}

const RESISTANCE_PIXELS = 80
const DEFAULT_RESISTANCE = 0.75
const END_RESISTANCE = 0
gsap.set(button, {
  x: window.innerWidth * 0.5,
  y: window.innerHeight * 0.5,
  yPercent: -50,
  xPercent: -50,
})

for (const target of targets) {
  Draggable.create(target, {
    inertia: false,
    type: 'x,y',
    onDrag: () => {
      document.querySelector('.arrow--move').style.opacity = 0
    },
  })
}

Draggable.create(button, {
  inertia: true,
  allowContextMenu: true,
  type: 'x,y',
  dragResistance: DEFAULT_RESISTANCE,
  resistance: 1800,
  snap: {
    points: function (point) {
      const { isDragging, __unlocked, startX, startY } = this
      const closestPoint = getClosestPoint(point, config.proximity)
      if (!isDragging && !__unlocked) {
        console.info('starting point')
        return { x: startX, y: startY }
      } else if (__unlocked && closestPoint) {
        console.info('setting point', closestPoint)
        for (const t of targets) t.dataset.active = false
        closestPoint.coordinate.element.dataset.active = true
        return closestPoint.coordinate
      }
      return point
    },
  },
  bounds: '.targets',
  onDragStart: function (event) {
    const bounds = this.target.getBoundingClientRect()
    const currentPoint = {
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    }
    this.__start = currentPoint
    this.dragResistance = DEFAULT_RESISTANCE
    this.__unlocked = false
    document.documentElement.dataset.dragging = true
  },
  onDrag: function (event) {
    const { startX, startY, x, y } = this
    const distance = Math.hypot(x - startX, y - startY)
    const newResistance = gsap.utils.clamp(
      END_RESISTANCE,
      DEFAULT_RESISTANCE,
      gsap.utils.mapRange(
        0,
        RESISTANCE_PIXELS,
        DEFAULT_RESISTANCE,
        END_RESISTANCE
      )(Math.abs(distance))
    )
    if (!this.__unlocked) this.dragResistance = newResistance
    if (!this.__unlocked && newResistance === END_RESISTANCE) {
      this.__unlocked = true
      document.querySelector('.arrow--instruction').style.opacity = 0
      for (const t of targets) t.dataset.active = false
    }
  },
  onDragEnd: function () {
    this.dragResistance = DEFAULT_RESISTANCE
    this.__unlocked = false
  },
  onRelease: () => {
    document.documentElement.dataset.dragging = false
  },
  onThrowComplete: function () {
    this.dragResistance = DEFAULT_RESISTANCE
    this.__unlocked = false
  },
})

// do some Popover stuff...
const pop = document.querySelector('[popover]')
let f

const closePopover = async () => {
  if (f) {
    f.pause()
    await f.reverse(f.time())
    pop.hidePopover()
  } else {
    // need to flip down to the button location which could be "tricky"
    // first ascertain if you're next to a hotspot
    let closerBounds
    const pos = pop.getBoundingClientRect()
    const center = {
      x: pos.x + pos.width * 0.5,
      y: pos.y + pos.height * 0.5,
    }
    const {
      x: buttonX,
      y: buttonY,
      width: buttonWidth,
      height: buttonHeight,
    } = button.getBoundingClientRect()
    const closest = getClosestPoint(
      { x: center.x, y: center.y },
      config.proximity
    )
    if (closest) {
      closerBounds = closest.coordinate.element.getBoundingClientRect()
      gsap.set(button, {
        opacity: 0,
        x: closest.coordinate.x,
        y: closest.coordinate.y,
      })
    }
    //
    const state = Flip.getState(
      [
        // button,
        pop,
        '.placeholder',
        '.placeholder > svg',
        '[popover] .popover__content',
      ],
      {
        nested: true,
        props: 'borderRadius, scale, opacity, filter, backgroundColor, color',
      }
    )
    // now set the popover attributes
    gsap.set(pop, {
      width: buttonWidth,
      height: buttonHeight,
      top: closest
        ? closerBounds.top + closerBounds.height * 0.5
        : buttonY + buttonHeight * 0.5,
      left: closest
        ? closerBounds.left + closerBounds.width * 0.5
        : buttonX + buttonWidth * 0.5,
      opacity: 1,
      borderRadius: '21px',
      x: 0,
      y: 0,
      xPercent: -50,
      yPercent: -50,
      backgroundColor: getComputedStyle(document.body).color,
      color: getComputedStyle(document.body).backgroundColor,
    })
    gsap.set('.placeholder > svg', {
      width: 20,
      height: 20,
      opacity: 1,
    })

    gsap.set('[popover] .popover__content', {
      y: 0,
      opacity: 0,
      filter: 'blur(4px)',
    })
    // try it
    await Flip.from(state, {
      duration: config.duration,
      nested: true,
      ease: 'power2.inOut',
    })
    gsap.set(button, { opacity: 1 })
    pop.hidePopover()
  }
}

let d

pop.addEventListener('toggle', async (event) => {
  if (event.newState === 'open') {
    // we need to work out the correct position for x/y
    const {
      x: buttonX,
      y: buttonY,
      width: buttonWidth,
      height: buttonHeight,
    } = button.getBoundingClientRect()
    const center = {
      x: buttonX + buttonWidth * 0.5,
      y: buttonY + buttonHeight * 0.5,
    }
    const {
      x: popX,
      y: popY,
      width: popWidth,
      height: popHeight,
    } = pop.getBoundingClientRect()

    let vertical = 'center'
    if (center.y < popHeight * 0.5 + 24) vertical = 'bottom'
    if (center.y > window.innerHeight - (popHeight * 0.5 + 24)) vertical = 'top'
    let horizontal = 'center'
    if (center.x < popWidth * 0.5) horizontal = 'left'
    if (center.x > window.innerWidth - popWidth * 0.5) horizontal = 'right'
    const result = `vertical: ${vertical}; horizontal: ${horizontal};`

    console.info({ result })

    // now do the FLIPPING stuff
    gsap.set('[popovertarget]', {
      boxShadow: 'none',
    })
    gsap.set(pop, {
      width: buttonWidth,
      height: buttonHeight,
      top: buttonY,
      left: buttonX,
      opacity: 1,
      borderRadius: '21px',
    })

    const state = Flip.getState(
      [
        pop,
        '.placeholder',
        '.placeholder > svg',
        '[popover] .popover__content',
      ],
      {
        nested: true,
        props: 'borderRadius, scale, opacity, filter, backgroundColor, color',
      }
    )

    // assume central position first
    const position = {
      left: center.x,
      top: center.y,
      xPercent: -50,
      yPercent: -50,
    }

    if (horizontal === 'left') {
      position.right = 'unset'
      position.left = '1.5rem'
      position.xPercent = 0
    }
    if (horizontal === 'right') {
      position.left = 'unset'
      position.right = '1.5rem'
      position.xPercent = 0
    }
    if (vertical === 'bottom') {
      position.top = '1.5rem'
      position.bottom = 'unset'
      position.yPercent = 0
    }
    if (vertical === 'top') {
      position.bottom = '1.5rem'
      position.top = 'unset'
      position.yPercent = 0
    }

    gsap.set(pop, { clearProps: 'width,height' })
    gsap.set(pop, {
      ...position,
      opacity: 1,
      borderRadius: '6px',
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      color: getComputedStyle(document.body).color,
    })

    gsap.set('.placeholder > svg', {
      width: 16,
      height: 16,
      opacity: 0.5,
    })

    gsap.set('[popover] .popover__content', {
      y: 0,
      opacity: 1,
      filter: 'blur(0px)',
      background: '#0000',
    })

    f = Flip.from(state, {
      // duration: 0.36,
      duration: config.duration,
      nested: true,
      ease: 'power2.inOut',
    })
    window.addEventListener('keydown', closePopover)
    // if (d) d[0].kill()
    d = Draggable.create(pop, {
      dragClickables: false,
      inertia: true,
      allowContextMenu: true,
      type: 'x,y',
      bounds: '.targets',
      onDrag: () => {
        f = undefined
        const pos = pop.getBoundingClientRect()
        const center = {
          x: pos.x + pos.width * 0.5,
          y: pos.y + pos.height * 0.5,
          xPercent: -50,
          yPercent: -50,
        }
        gsap.set(button, {
          x: center.x,
          y: center.y,
          xPercent: -50,
          yPercent: -50,
        })
      },
      onThrowUpdate: () => {
        f = undefined
        const pos = pop.getBoundingClientRect()
        const center = {
          x: pos.x + pos.width * 0.5,
          y: pos.y + pos.height * 0.5,
        }
        gsap.set(button, {
          x: center.x,
          y: center.y,
        })
      },
    })
  } else {
    // closing
    gsap.set([pop, '.placeholder > svg', '[popover] .popover__content'], {
      clearProps: 'all',
    })
    gsap.set(button, {
      clearProps: 'box-shadow',
      opacity: 1,
    })
    window.removeEventListener('keydown', closePopover)
  }
})

document
  .querySelector('[aria-label="Minimize"]')
  .addEventListener('click', closePopover)

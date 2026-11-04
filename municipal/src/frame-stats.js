// Fixed-size telemetry: measuring a long session must not itself retain its frames.
export class FrameStats{
 constructor(capacity=600){this.capacity=capacity;this.intervals=new Float32Array(capacity);this.work=new Float32Array(capacity);this.count=0;this.cursor=0;}
 add(interval,work){this.intervals[this.cursor]=interval;this.work[this.cursor]=work;this.cursor=(this.cursor+1)%this.capacity;this.count=Math.min(this.capacity,this.count+1);}
 summary(){const values=a=>Array.from(a.subarray(0,this.count)).sort((a,b)=>a-b),intervals=values(this.intervals),work=values(this.work),percentile=(a,p)=>a.length?a[Math.min(a.length-1,Math.floor(a.length*p))]:0;return{samples:this.count,intervalP95:percentile(intervals,.95),intervalP99:percentile(intervals,.99),cpuP95:percentile(work,.95),cpuP99:percentile(work,.99),longFrames:intervals.filter(x=>x>50).length};}
}
